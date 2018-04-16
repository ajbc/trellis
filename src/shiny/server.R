library(shiny)
library(shinyjs)
library(jsonlite)
library(stm)
library(data.table)
library(htmlwidgets)
library(topicBubbles)
library(topicTree)
library(xtable) # Used to sanitize output

options(shiny.maxRequestSize=1e4*1024^2)

# NOTE(tfs): Constants in use for now. The goal is to remove
#            `num.documents.shown` in favor of dynamically loading
#            more documents on the left panel as the user scrolls
file.home <- "~"
num.documents.shown <- 100

function(input, output, session) {
  # Initialize a single storage of state.
  # This will serve as the ground truth for the logic/data of the tool
  # assigns:
  #    Structured as a list such that each child is an "index" and the corresponding value is its parent
  #    NOTE: root is represented as "root"
  stateStore <- reactiveValues(manual.titles=list(), assigns=NULL, dataname="Data")

  # Parse the user-provided dataset name (from the initial panel)
  chosenDataName <- reactive({
    return(stateStore$dataname)
  })

  # Display user-provided dataset name
  output$topic.chosenName <- reactive({
    return(chosenDataName())
  })

  # Load data from provided model file and path to directory containing text files (if provided)
  data <- reactive({
    if ((is.null(isolate(input$modelfile))) && is.null())
      return(NULL)

    # Build full file name
    path <- parseFilePaths(c(home=file.home), isolate(input$modelfile))

    # Loads `beta`, `theta`, `filenames`, `titles`, and `vocab`
    load(as.character(path$datapath))

    # Optionally load pre-saved data
    vals <- ls()

    if ("dataName" %in% vals) {
      stateStore$dataname <- dataName
    }

    if ("aString" %in% vals) {
      newA <- c()

      for (ch in seq(nrow(beta))) {
        newA[[ch]] <- 0 # Will be overwritten, but ensures that at least all assignments to 0 are made
      }

      for (pair in strsplit(aString, ",")[[1]]) {
        rel <- strsplit(pair, ":")[[1]]

        newA[[as.integer(rel[[1]])]] <- as.integer(rel[[2]])
      }

      stateStore$assigns <- newA
    }

    if ("mantitles" %in% vals) {
      stateStore$manual.titles <- mantitles
    }

    # Parse path to text file directory
    document.location <- NULL
    if (!is.null(isolate(input$textlocation))) {
      # document.location <- file.home

      # for (part in isolate(input$textlocation$path)) {
        # document.location <- file.path(document.location, part)
      # }
      document.location <- as.character(parseDirPath(c(home=file.home), isolate(input$textlocation)))
    }

    # Tell frontend to initiate clearing of:
    #     * input[["textlocation-modal"]]
    #     * input[["textlocation"]]
    #     * input[["modelfile-modal"]]
    #     * input[["modelfile"]]
    # To free up resources (shinyFiles seems to be fairly expensive/have a fairly high performance impact otherwise)
    session$sendCustomMessage(type="clearFileInputs", "")
    return(list("beta"=beta, "theta"=theta, "filenames"=filenames, "doc.titles"=titles, "document.location"=document.location, "vocab"=vocab))
  })

  # Find the number of documents (titles) according to the loaded model file
  num.documents <- reactive({
    return(length(data()$doc.titles))
  })

  # Handle enabling/disabling the "Start" button on the initial panel.
  #        Model file must be provided, but `input$textlocation` is optional
  observe({
    shinyjs::toggleState("topic.start", !is.null(input$modelfile))
  })

  # Setup shinyFiles for model file selection and text file directory selection
  shinyFileChoose(input, 'modelfile', roots=c(home=file.home), session=session, restrictions=system.file(package='base'))
  shinyDirChoose(input, 'textlocation', roots=c(home=file.home), session=session, restrictions=system.file(package='base'))
  shinyFileSave(input, 'savedata', roots=c(home=file.home), session=session, restrictions=system.file(package='base'))

  observeEvent(input$savedata, {
    if (is.null(input$savedata)) {
      return(NULL)
    }

    # All values to be saved
    sp <- parseSavePath(c(home=file.home), input$savedata)
    file <- as.character(sp$datapath)
    beta <- data()$beta
    theta <- data()$theta
    filenames <- data()$filenames
    titles <- data()$doc.titles
    vocab <- data()$vocab
    aString <- assignString()
    mantitles <- stateStore$manual.titles
    dataName <- chosenDataName()

    save(beta=beta, theta=theta, filenames=filenames, titles=titles,
          vocab=vocab, assignString=aString, manual.titles=mantitles,
          dataName=dataName, file=file)

    session$sendCustomMessage(type="clearSaveInput", "")
  })

  # On "Start", tell the frontend to disable "Start" button and render a message to the user
  #             This is separated out to ensure it fires before shinyFiles
  #             resource usage could potentially cause the message to not display.
  observeEvent(input$topic.start, {
    chosen <- input$topic.datasetName
    if (chosen == "") {
      chosen <- "Data"
    }

    stateStore$dataname <- chosen

    session$sendCustomMessage(type="processingFile", "")
  })

  # Triggered by topics.js handler for "processingFile", should remove race condition/force sequentiality
  observeEvent(input$start.processing, {
    req(data()) # Ensures that data() will finish running before displays transition on the frontend

    if (is.null(stateStore$assigns)) {
      if (input$initialize.kmeans) {
        fit <- initial.kmeansFit()
        initAssigns <- c(fit$cluster + K(), rep(0, input$initial.numClusters))
      } else {
        initAssigns <- c(rep(0, K()))
      }

      stateStore$assigns <- initAssigns
    }

    req(bubbles.data()) # Similarly ensures that bubbles.data() finishes running before displays transition
    shinyjs::hide(selector=".initial")
    shinyjs::show(selector=".left-content")
    shinyjs::show(selector=".main-content")
    shinyjs::show(selector="#document-details-container")
    session$sendCustomMessage(type="initializeMainView", "")
  })


  # Observe that export button has been pressed, pass back to frontend
  observeEvent(input$enterExportMode, {
    session$sendCustomMessage("enterExportMode", "")
  })


  # Observe that cancel button (for export) has been pressed, pass back to frontend
  observeEvent(input$exitExportMode, {
    session$sendCustomMessage("exitExportMode", "")  
  })


  # When selected topic (e.g. when a bubble has been clicked) changes, notify frontend
  observeEvent(input$topic.selected, {
    session$sendCustomMessage("topicSelected", input$topic.selected)
  })


  # When active topic (e.g. when a bubble has been hovered) changes, notify frontend
  observeEvent(input$topic.active, {
    session$sendCustomMessage("topicSelected", input$topic.selected)
  })


  # Returns the highest topic id number
  max.id <- reactive({
    # NOTE(tfs): max() returns NA if NA exists
    return(max(K(), max(stateStore$assigns[!is.na(stateStore$assigns)])))
  })


  # Encodes the assignment/hierarchy structure as a string:
  #      "[child]:[parent],[child]:[parent],..."
  assignString <- reactive({
    if (is.null(stateStore$assigns)) {
      return(NULL)
    }

    tmpAssigns <- c()

    for (i in seq(length(stateStore$assigns))) {
      if (is.na(stateStore$assigns[[i]])) { next } # Continue
      newAssign <- paste(i, stateStore$assigns[[i]], sep=":")
      tmpAssigns <- append(tmpAssigns, newAssign)
    }

    return(paste(tmpAssigns, collapse=","))
  })


  # Shorter accessor for data()$beta
  beta <- reactive({
    if (is.null(data()))
      return(NULL)

    return(data()$beta)
  })


  # Because beta() only provides values for the initial K() topics,
  #    calculate the beta values for all meta-topics/clusters
  all.beta <- reactive({
    leaf.beta <- beta()
    lids <- leaf.ids()
    weights <- colSums(data()$theta)

    # Initialzie matrix for beta values
    ab <- matrix(0, nrow=max.id(), ncol=ncol(leaf.beta))

    for (l in seq(K())) {
      ab[l,] <- leaf.beta[l,]
    }

    # Use beta values of leaves (intial topics) to calculate aggregate beta values for meta topics/clusters
    if (max.id() > K()) {
      for (clusterID in seq(K()+1, max.id())) {
        if (is.na(stateStore$assigns[[clusterID]])) { next }

        val <- 0

        leaves <- leaf.ids()[[clusterID]]

        for (leafid in leaves) {
          val <- leaf.beta[leafid,] * weights[leafid]
          ab[clusterID,] <- ab[clusterID,] + val
        }
      }
    }

    return(ab)
  })


  # Number of initial topics in the model
  K <- reactive({
    if (is.null(data()))
      return(NULL)

    return(nrow(beta()))
  })

  # Because the initial kmeans clustering of topics does not originate from a user input,
  #         this separate method handles it.
  initial.kmeansFit <- reactive({
    if (is.null(beta())) {
      return(NULL)
    }

    if (input$initialize.kmeans) {
      return(kmeans(beta(), input$initial.numClusters))
    } else {
      return(NULL)
    }
  })

  # TODO(tfs): For simple updates, we probably don't need to recreate all of assignments.
  #            There should be a way to improve efficiency for small changes to the hierarchy.
  # observeEvent(input$clusterUpdate, {
  #   print("TODO: should be more efficient for small/simple changes like shifting a single node")  
  # })

  # Given that a hierarchy already exists (the widgets are already rendered),
  #       initiate a new clustering that operates on the direct descendants of the selected node (if able).
  #       Can also operate on direct descendants of the root.
  observeEvent(input$runtimeCluster, {
    # Check that all conditions are met before performing clustering
    req(data())

    if (is.null(input$topic.selected)) {
      session$sendCustomMessage(type="runtimeClusterError", "No topic selected")
      return()
    }

    selectedTopic <- as.integer(input$topic.selected)

    numNewClusters <- isolate(input$runtime.numClusters)

    if (length(selected.children()) <= numNewClusters) {
      session$sendCustomMessage(type="runtimeClusterError", "Too few children for number of clusters")
      return()
    }

    # Calculate a new fit for direct descendants of selected topic/cluster
    # NOTE(tfs): We probably don't need to isolate here, but I'm not 100% sure how observeEvent works
    newFit <- kmeans(selected.childBetas(), isolate(input$runtime.numClusters))

    childIDs <- selected.children()

    maxOldID <- max.id()

    # Add new clusters into assignments
    for (i in seq(numNewClusters)) {
      stateStore$assigns[[i + maxOldID]] = selectedTopic
    }

    # Update assignments to reflect new clustering
    for (i in seq(length(childIDs))) {
      ch <- childIDs[[i]]
      pa <- newFit$cluster[[i]] + maxOldID
      stateStore$assigns[[ch]] = pa
    }

    # Notify frontend of completion
    session$sendCustomMessage("runtimeClusterFinished", "SUCCESS")
  })

  # Handle deletion of the selected cluster, triggered by a button on frontend
  observeEvent(input$deleteCluster, {
    # Check for good input
    if (is.null(input$topic.selected) || input$topic.selected == "") { return() }
    topic = input$topic.selected

    # DO NOT DELETE if selected topic is a leaf (initial cluster)
    if ((topic == 0) || (topic <= K())) { return() }

    childIDs <- children()[[topic]]

    if (length(childIDs) > 0) {
      for (ch in childIDs) {
        stateStore$assigns[[ch]] = stateStore$assigns[[topic]]
      }
    }

    stateStore$assigns[[topic]] <- NA

    session$sendCustomMessage("nodeDeleted", "SUCCESS")
  })


  # Default titles (top 5 most probable words) for each of the initial topics
  titles <- reactive({
    rv <- c()
    if (is.null(data()))
      return(rv)

    for (k in seq(K())) {
      title <- paste(data()$vocab[order(beta()[k,], decreasing=TRUE)][seq(5)], collapse=" ")
      rv <- c(rv, title)
    }

    return(rv)
  })


  # Default titles (top 5 most probable words) for each meta topic/cluster
  cluster.titles <- reactive({
    if (is.null(data())) {
      return(c())
    }

    if (node.maxID() <= 0) {
      return(c())
    }

    marginals <- matrix(0, nrow=node.maxID(), ncol=ncol(beta()))
    weights <- colSums(data()$theta)

    # NOTE(tfs): This is less efficient than building from the base up,
    #            but there is currently no explicit tree-structured data storage
    for (i in seq(node.maxID())) {
      clusterID <- i+K()

      leaves <- leaf.ids()[[clusterID]]

      val <- 0

      for (leafid in leaves) {
        val <- beta()[leafid,] * weights[leafid]
        marginals[clusterID-K(),] <- marginals[clusterID-K(),] + val
      }
    }

    rv <- c()
    for (cluster in seq(node.maxID())) {
      title <- paste(data()$vocab[order(marginals[cluster,],
                                            decreasing=TRUE)][seq(5)], collapse=" ")

      rv <- c(rv, title)
    }

    return(rv)
  })


  # Display title for all topics and meta topics/clusters. Manual title if provided, else default title
  all.titles <- reactive({
    rv <- c()

    n <- max.id()

    ttl <- c(titles(), cluster.titles())

    # Select correct title (manual if it exists, else default) for all topics and meta topics/clusters
    for (i in seq(n)) {
      if (i > length(stateStore$manual.titles)
      || is.null(stateStore$manual.titles[[i]])
      || stateStore$manual.titles[[i]] == "") {
        if (i > length(ttl) 
        || is.null(ttl[[i]])
        || i > length(stateStore$assigns)
        || is.null(stateStore$assigns[[i]])) {
          rv <- c(rv, "")
        } else {
          rv <- c(rv, ttl[[i]]) 
        }
      } else {
        rv <- c(rv, stateStore$manual.titles[[i]])
      }
    }

    return(rv)
  })

  # Display title for currently active (e.g. hovered) topic
  #         Document tab displays contents for any hovered OR selected topic.
  topic.doctab.title <- reactive({
    if (input$topic.active == "") {
      return("Please Hover or Select a Topic")
    }

    topic <- as.integer(input$topic.active)

    if (topic == 0) { return("[ROOT]") }

    return(sanitize(all.titles()[topic], type="html"))
  })

  # Display title for currently selected (e.g. hovered) topic.
  #         Topic tab does not display anything if no topic is selected.
  topic.topictab.title <- reactive ({
    if (input$topic.selected == "") {
      return("Please Select a Topic")
    }

    topic <- as.integer(input$topic.selected)

    if (topic == 0) { return("[ROOT]") }

    return(sanitize(all.titles()[topic], type="html"))
  })

  # Handle changes to assignments from the frontend.
  #     To maintain ground truth, update stateStore on the backend.
  #     This ensures that data is consistent between widgets, as all output data is based solely
  #      on the backend's ground truth `stateStore`
  # Provided as a string encoding (same format as `assignString()`)
  observeEvent(input$topics, {
    if (is.null(input$topics) || input$topics == "" || input$topics == assignString()) { return() }
    
    node.ids <- c()
    parent.ids <- c()

    for (pair in strsplit(input$topics, ',')[[1]]) {
      ids <- strsplit(pair, ":")[[1]]
      node.ids <- c(node.ids, as.integer(ids[[1]]))
      parent.ids <- c(parent.ids, as.integer(ids[[2]]))
    }

    pids <- parent.ids[order(node.ids)]
    cids <- node.ids[order(node.ids)]

    # Clear old settings
    stateStore$assigns <- c()

    for (i in seq(length(cids))) {
      stateStore$assigns[[cids[[i]]]] = pids[[i]]
    }
  })


  # Full storage of child IDs for each node (0 is root)
  children <- reactive({
    if (is.null(stateStore$assigns)) { return() }
   
    childmap <- list()

    n <- max.id()

    for (ch in seq(n)) {
      p <- stateStore$assigns[[ch]]
      if (is.na(p)) { 
        next
      }
      if (p == 0) {
        if (!is.null(childmap$root)) {
          # Root has already been initialized
          childmap$root <- append(childmap$root, ch)
        } else {
          childmap$root <- c(ch)
        }
      } else {
        if (p <= length(childmap) && !is.null(childmap[[p]])) {
          childmap[[p]] <- append(childmap[[p]], ch)
        } else {
          childmap[[p]] <- c(ch)
        }
      }
    }

    return(childmap)
  })

  # List of children for selected topic
  selected.children <- reactive({
    req(children())
    parentNode <- as.integer(input$topic.selected)
    if (is.na(parentNode) || parentNode == 0) {
      return(children()$root)
    } else {
      return(children()[[parentNode]])
    }
  })

  # Beta values for all children of selected topic
  selected.childBetas <- reactive({
    childIDs <- selected.children()

    return(all.beta()[childIDs,])
  })

  # Returns the highest ID of any cluster, offset by the number of leaf nodes (K())
  node.maxID <- reactive({
    if (is.null(data())) {
      return(0)
    }

    return(max.id() - K())
  })

  # Format HTML for list of documents sorted by topic relevance
  output$topic.doctab.summary <- renderUI({
    out.string <- paste("<hr/>\n<h3>Topic Summary</h3>\n",
                        "<h4>", topic.doctab.title(), "</h4>\n", documents())
    return(HTML(out.string))
  })

  # Returns the ordering of files for the selected topic
  selected.topic.fileorder <- reactive({
    # NOTE(tfs): The user should only be able to click on a document if a topic is selected,
    #            But the distinction between selected and active topics may be an issue here
    topic <- as.integer(input$topic.selected)
    idx <- as.integer(input$document.details.docid)

    if (is.na(topic) || is.na(idx)) { return() }

    if (topic > K()) {
      ordering <- order(meta.theta()[,topic-K()], decreasing=TRUE)
    } else {
      ordering <- order(data()$theta[,topic], decreasing=TRUE)
    }

    return(ordering)
  })

  # Returns the full text contents of a file that the user clicks
  selected.document <- reactive({
    topic <- as.integer(input$topic.selected)
    idx <- as.integer(input$document.details.docid)

    if (is.na(topic) || is.na(idx)) { return() }

    fname <- file.path(data()$document.location, data()$filenames[selected.topic.fileorder()[idx]])

    contents <- tryCatch({
      readChar(fname, file.info(fname)$size)
    }, warning = function (w) {
      print("Warning while loading file")
      return()
    }, error = function (w) {
      print("Error while loading file")
      return()
    })

    return(contents)
  })

  # Returns the document title of the document clicked by the user
  output$document.details.title <- renderUI({
    topic <- as.integer(input$topic.selected)
    idx <- as.integer(input$document.details.docid)

    if (is.na(topic) || is.na(idx)) { return() }

    title <- data()$doc.titles[selected.topic.fileorder()[idx]]

    rv <- paste("<h4 id=\"document-details-title\" class=\"centered\">", sanitize(title, type="html") ,"</h4>")
    return(HTML(rv))
  })


  # Formats the document (title and contents) clicked by the user.
  output$document.details <- renderUI({
    topic <- as.integer(input$topic.selected)
    idx <- as.integer(input$document.details.docid)

    if (is.na(topic) || is.na(idx)) { return() }

    rv <- paste("<p>", sanitize(selected.document(), type="html"), "</p>")
    return(HTML(rv))
  })


  # Mapping of each cluster to all of its descendant leaves (initial topics)
  leaf.ids <- reactive({
    if (is.null(stateStore$assigns)) { return() }
    leafmap <- list()

    # Leaf set = original K() topics
    for (ch in seq(K())) {
      itrID <- ch

      p <- stateStore$assigns[itrID]
      if (is.na(p) || is.null(p)) { next } # Continue
      while (p > 0) {
        if (p <= length(leafmap) && !is.null(leafmap[[p]])) {
          leafmap[[p]] <- append(leafmap[[p]], ch)
        } else {
          leafmap[[p]] <- c(ch)
        }

        itrID <- p

        p <- stateStore$assigns[itrID]
      }
    }

    return(leafmap)
  })

  # Calculates theta values for all meta topics/clusters
  meta.theta <- reactive({
    theta <- data()$theta
    mtheta <- matrix(0, nrow=nrow(theta), ncol=node.maxID())
    
    if (node.maxID() <= 0) {
      return(mtheta)
    }

    for (clusterID in seq(K()+1, max.id())) {
      if (clusterID > length(leaf.ids()) || is.null(leaf.ids()[[clusterID]])) { next }
      
      leaves <- leaf.ids()[[clusterID]]

      for (leafID in leaves) {
        mtheta[,clusterID-K()] <- mtheta[,clusterID-K()] + theta[,leafID]
      }
    }

    return(mtheta)
  })

  # TODO(tfs): Phase this out in favor of dynamically displaying an increasing number
  #            of document titles on the left panel
  last.shown.docidx <- reactive({
    return(min(num.documents(), num.documents.shown))
  })

  # List of document titles, sorted by topic relevance, for all topics and meta topics/clusters
  top.documents <- reactive({
    rv <- list()
    theta <- data()$theta
    # meta.theta <- matrix(0, nrow=nrow(theta), ncol=length(assignments()) - K())
    for (topic in seq(K())) {
      # rv[[topic]] <- data()$doc.summaries[order(theta[,topic], decreasing=TRUE)[1:100]]
      
      rv[[topic]] <- data()$doc.titles[order(theta[,topic], decreasing=TRUE)[1:last.shown.docidx()]] # Top 100 documents

      # meta.theta[,assignments()[topic] - K()] <-
      #   meta.theta[,assignments()[topic] - K()] + theta[,topic]
    }

    if (node.maxID() > 0) {
      for (meta.topic in seq(node.maxID())) {
        # rv[[meta.topic + K()]] <- data()$doc.summaries[order(meta.theta()[,meta.topic],
                                                  # decreasing=TRUE)[1:100]]
        rv[[meta.topic + K()]] <- data()$doc.titles[order(meta.theta()[,meta.topic],
                                                  decreasing=TRUE)[1:last.shown.docidx()]]
      }
    }

    return(rv)
  })

  # Returns the theta values of all documents corresponding to the selected topic
  thetas.selected <- reactive({
    topic.theta <- data()$theta
    topic <- as.integer(input$topic.active)

    if (is.na(topic)) {
      return(list())
    }

    if (topic <= K()) {
      sorted <- topic.theta[,topic][order(topic.theta[,topic], decreasing=TRUE)]
    } else {
      sorted <- meta.theta()[,topic-K()][order(meta.theta()[,topic-K()], decreasing=TRUE)]
    }

    return(sorted)
  })

  # Top document titles for selected topic, formatted into HTML elements
  documents <- reactive({
    topic <- as.integer(input$topic.active)

    if (is.na(topic) || topic == 0) {
      return("")
    }

    docs <- top.documents()[[topic]]
    thetas <- thetas.selected() # Used to show relative relevance to topic
    rv <- ""

    for (i in 1:length(top.documents()[[topic]])) {
      rv <- paste(rv, "<div class=\"document-summary\"",
                  paste("onclick=\"clickDocumentSummary(", toString(i), ")\">", sep=""),
                  "<div class=\"document-summary-fill\" style=\"width:",
                  paste(as.integer(thetas[i] * 100), "%;", sep=""),
                  "\"></div>",
                  "<p class=\"document-summary-contents\">",
                  sanitize(substr(docs[i], start=1, stop=75), type="html"),
                  "</p>",
                  "</div>")
    }
    return(rv)
  })


  # Display the title of the selected or active topic (document tab)
  output$topic.document.title <- renderUI({
    return(HTML(topic.doctab.title()))
  })


  # Render the titles of top documents for the selected topic
  output$topic.documents <- renderUI({
    return(HTML(documents()))
  })  


  # Display the title of the selected topic (topic tab)
  output$topicTabTitle <- renderUI({
    ostr <- paste("<h4 id=\"left-topic-tab-cluster-title\">", topic.topictab.title(), "</h4>")
    return(HTML(ostr))
  })

  # When user presses the update title button, store the update into backend stateStore
  observeEvent(input$updateTitle, {
    topic <- as.integer(input$topic.selected)

    newTitle <- input$topic.customTitle
    if (is.null(newTitle)) {
      newTitle = ""
    }

    stateStore$manual.titles[[topic]] <- newTitle
  })

  # Aggregate and format data necessary for the bubble/tree widgets, in parallel lists:
  #     parentID:    list of parent ids
  #     nodeID:      list of child ids
  #     weight:      list of node weights
  #     title:       list of node titles
  bubbles.data <- reactive({
    if (is.null(data())) {
      return(NULL)
    }

    pid <- c()
    nid <- c()
    ttl <- c()

    # n <- length(stateStore$assigns)
    n <- max.id()

    for (ch in seq(n)) {
      if (is.na(stateStore$assigns[[ch]])) { next } # Continue
      nid <- append(nid, ch)
      pid <- append(pid, stateStore$assigns[ch])
      ttl <- append(ttl, all.titles()[[ch]])
    }

    wgt <- c(colSums(data()$theta))

    if (length(pid) > length(wgt)) {
      for (i in seq(length(pid) - length(wgt))) {
        wgt <- append(wgt, 0)
      }
    }

    rv <- data.frame(parentID=pid, nodeID=nid, weight=wgt, title=ttl)
    return(rv)
  })

  # Render bubble widget
  output$bubbles <- renderTopicBubbles({ topicBubbles(bubbles.data()) })

  # Render tree widget
  output$tree <- renderTopicTree({ topicTree(bubbles.data()) })
}





