library(shiny)
library(shinyjs)
library(jsonlite)
library(stm)
library(data.table)
library(htmlwidgets)
library(topicBubbles)
library(topicTree)

options(shiny.maxRequestSize=1e4*1024^2)

# Always check whether the entry exists before accessing.
#        Simpler than updating whenever clustering/nodes/etc. change

function(input, output, session) {
  stateStore <- reactiveValues(manual.titles=list(), assigns=NULL)

  chosenDataName <- reactive({
    chosen <- input$topic.datasetName
    if (chosen != "") {
      return(chosen)
    } else {
      return("Dataset")
    }
  })

  output$topic.chosenName <- reactive({
    return(chosenDataName())
  })

  # isolate(input$topic.file) # Really not sure how best to isolate these yet? Probably not necessary as everything should hide anyway
  data <- reactive({
    inFile <- input$topic.file
    if (is.null(inFile))
      return(NULL)

    load(inFile$datapath)

    # session$sendCustomMessage("parsed", "Parsed");
    return(list("model"=model, "out"=out, "processed"=processed, "doc.summaries"=doc.summaries))
    # return(list("out"=out, "processed"=processed, "docSummaries"=doc.summaries))
  })

  observe({
    shinyjs::toggleState("topic.start", !is.null(input$topic.file))
  })

  observeEvent(input$topic.start, {
    session$sendCustomMessage(type="processingFile", "")
    req(data())

    if (input$initialize.kmeans) {
      fit <- initial.kmeansFit()
      initAssigns <- c(fit$cluster + K(), rep(0, input$initial.numClusters))
    } else {
      initAssigns <- c(rep(0, K()))
    }

    # session$sendCustomMessage(type="initialAssignments", initAssigns)

    stateStore$assigns <- initAssigns

    req(bubbles.data())
    shinyjs::hide(selector=".initial")
    shinyjs::show(selector=".left-content")
    shinyjs::show(selector=".main-content")
    shinyjs::show(selector="#document-details-container")
    session$sendCustomMessage(type="initializeMainView", "")
  })


  observeEvent(input$enterExportMode, {
    session$sendCustomMessage("enterExportMode", "")
  })


  observeEvent(input$exitExportMode, {
    session$sendCustomMessage("exitExportMode", "")  
  })


  observeEvent(input$topic.selected, {
    session$sendCustomMessage("topicSelected", input$topic.selected)
  })

  observeEvent(input$topic.active, {
    session$sendCustomMessage("topicSelected", input$topic.selected)
  })


  # output$downloadSVG = downloadHandler(
  #   filename = function () { paste(paste(chosenDataName(), input$selectedView, sep="_"), "svg", sep=".") },
  #   content = function (file) {
  #     outString <- input$svgString
  #     write(out, file=file, row.names=FALSE, quote=FALSE)
  #   }
  # )


  max.id <- reactive({
    # NOTE(tfs): max() returns NA if NA exists
    return(max(K(), max(stateStore$assigns[!is.na(stateStore$assigns)])))
  })


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


  beta <- reactive({
    if (is.null(data()))
      return(NULL)

    return(exp(data()$model$beta$logbeta[[1]]))
  })

  all.beta <- reactive({
    leaf.beta <- beta()
    lids <- leaf.ids()
    weights <- colSums(data()$model$theta)

    ab <- matrix(0, nrow=max.id(), ncol=ncol(leaf.beta))

    for (l in seq(K())) {
      ab[l,] <- leaf.beta[l,]
    }

    for (clusterID in seq(K()+1, max.id())) {
      if (is.na(stateStore$assigns[[clusterID]])) { next }

      val <- 0

      leaves <- leaf.ids()[[clusterID]]

      for (leafid in leaves) {
        val <- leaf.beta[leafid,] * weights[leafid]
        ab[clusterID,] <- ab[clusterID,] + val
      }
    }

    return(ab)
  })

  K <- reactive({
    if (is.null(data()))
      return(NULL)

    return(nrow(beta()))
  })

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

  observeEvent(input$clusterUpdate, {
    print("TODO: should be more efficient for small/simple changes like shifting a single node")  
  })

  observeEvent(input$runtimeCluster, {
    req(data())

    if (is.null(input$topic.selected)) {
      session$sendCustomMessage(type="runtimeClusterError", "No topic selected")
      return()
    }

    selectedTopic <- as.integer(input$topic.selected)

    numNewClusters <- isolate(input$runtime.numClusters)

    # TODO(tfs): This is the rough structure I want, but should use direct children only
    # if (input$topic.selected == "") {
    #   newFit <- kmeans(beta(), isolate(input$runtime.numClusters))
    # } else {
    #   if (length(selected.children()) <= numNewClusters) {
    #     session$sendCustomMessage(type="runtimeClusterError", "Too few children for number of clusters")
    #     return()
    #   } else {
    #     newFit <- kmeans(selected.childBetas(), isolate(input$runtime.numClusters))
    #   }
    # }

    # msg = list(childIDs=selected.children(), fit=newFit$cluster)

    # session$sendCustomMessage(type="runtimeCluster", msg)

    # Handle root clustering exacltly the same as non-root clustering.
    # TODO(tfs): Add a cluster delete function to compensate
    if (length(selected.children()) <= numNewClusters) {
      session$sendCustomMessage(type="runtimeClusterError", "Too few children for number of clusters")
      return()
    }

    # NOTE(tfs): We probably don't need to isolate here, but I'm not 100% sure how observeEvent works
    newFit <- kmeans(selected.childBetas(), isolate(input$runtime.numClusters))

    childIDs <- selected.children()

    maxOldID <- max.id()

    for (i in seq(numNewClusters)) {
      stateStore$assigns[[i + maxOldID]] = selectedTopic
    }

    for (i in seq(length(childIDs))) {
      ch <- childIDs[[i]]
      pa <- newFit$cluster[[i]] + maxOldID
      stateStore$assigns[[ch]] = pa
    }

    session$sendCustomMessage("runtimeClusterFinished", "SUCCESS")
  })

  observeEvent(input$deleteCluster, {
    if (is.null(input$topic.selected) || input$topic.selected == "") { return() }
    topic = input$topic.selected

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

  titles <- reactive({
    rv <- c()
    if (is.null(data()))
      return(rv)

    for (k in seq(K())) {
      title <- paste(data()$out$vocab[order(beta()[k,], decreasing=TRUE)][seq(5)], collapse=" ")
      rv <- c(rv, title)
    }

    return(rv)
  })

  topic.doctab.title <- reactive({
    if (input$topic.active == "") {
      return("Please Hover or Select a Topic")
    }

    topic <- as.integer(input$topic.active)

    if (topic == 0) { return("[ROOT]") }

    return(all.titles()[topic])
  })

  topic.topictab.title <- reactive ({
    if (input$topic.selected == "") {
      return("Please Select a Topic")
    }

    topic <- as.integer(input$topic.selected)

    if (topic == 0) { return("[ROOT]") }

    return(all.titles()[topic])
  })

  observeEvent(input$topics, {
    if (is.null(input$topics) || input$topics == "" || input$topics == assignString()) { return() }
    
    node.ids <- c()
    parent.ids <- c()

    # for (pair in strsplit(input$topics, ',')[[1]]) {
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

  # TODO(tfs): New structure proposal, to help with reclustering:
  #            kmeans fits on backend send messages to frontend,
  #            restructure the nodes and update a string on frontend,
  #            linked as an input field. assignments then essentially
  #            just reflects this input field.
  # TODO(tfs): This will need to be updated for reclustering
  # assignments <- reactive({
  #   if (is.null(data())) {
  #     return(c())
  #   }

  #   # # NOTE(tfs): SHOULD only occur on initialization
  #   # # if (input$topics == "") {
  #   # if (is.null(assignString()) || assignString() == "") {
  #   #   if (input$initialize.kmeans) {
  #   #     fit <- initial.kmeansFit()
  #   #     initAssigns <- c(fit$cluster + K(), rep(0, input$initial.numClusters))
  #   #   } else {
  #   #     initAssigns <- c(rep(0, K()))
  #   #   }

  #   #   return(initAssigns)
  #   # }

  #   # node.ids <- c()
  #   # parent.ids <- c()
  #   # # for (pair in strsplit(input$topics, ',')[[1]]) {
  #   # for (pair in strsplit(assignString(), ',')[[1]]) {
  #   #   ids <- strsplit(pair, ":")[[1]]
  #   #   node.ids <- c(node.ids, as.integer(ids[[1]]))
  #   #   parent.ids <- c(parent.ids, as.integer(ids[[2]]))
  #   # }

  #   # # adjust ids for missing/deleted clusters
  #   # # TODO: consider a more elegant solution (see also download)
  #   # for (i in seq(max(parent.ids))) {
  #   #   # if this id doesn't exist, add a dummy one
  #   #   if (sum(node.ids==i) == 0) {
  #   #     node.ids <- c(node.ids, i)
  #   #     parent.ids <- c(parent.ids, 0)
  #   #   }
  #   # }

  #   # ids <- parent.ids[order(node.ids)]

  #   # # NOTE(tfs; 2017-10-12): If initial.numClusters was updated on the UI after
  #   # #      nodes were manually assigned, input$topics will not be empty.
  #   # #      However, the length of assignments in input$topics will
  #   # #      correspond to the previous initial.numClusters, resulting in a
  #   # #      crash unless we verify before returning here.
  #   # # NOTE(tfs; 2018-01-22): State should be stored/updated better in input$topics
  #   # #      after initialization. This should no longer be necessary.
  #   # # if (length(ids) != (K() + input$initial.numClusters)) {
  #   # #   return(c(fit$cluster + K(), rep(0, input$initial.numClusters)))
  #   # # }

  #   # return(ids)

  #   return(stateStore$assigns)
  # })

  # Full storage of child IDs for each node (0 is root)
  children <- reactive({
    # req(assignments())
    if (is.null(stateStore$assigns)) { return() }
    childmap <- list()

    n <- max.id()

    # for (i in seq(length(assignments()))) {
    #   childmap[[i]] <- c()
    # }

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

  selected.children <- reactive({
    req(children())
    parentNode <- as.integer(input$topic.selected)
    if (is.na(parentNode) || parentNode == 0) {
      return(children()$root)
    } else {
      return(children()[[parentNode]])
    }
  })

  # TODO(tfs): Adapt beta()[childIDs,], because beta() only provides betas for leaves
  selected.childBetas <- reactive({
    childIDs <- selected.children()

    return(all.beta()[childIDs,])
  })

  # Returns the highest ID of a cluster, offset by the number of leaf nodes (K())
  node.maxID <- reactive({
    if (is.null(data())) {
      return(0)
    }

    return(max.id() - K())
  })

  output$topic.doctab.summary <- renderUI({
    # if (input$active == "")
    #   return()

    out.string <- paste("<hr/>\n<h3>Topic Summary</h3>\n",
                        "<h4>", topic.doctab.title(), "</h4>\n", documents())
    return(HTML(out.string))
  })

  output$document.details <- renderUI({
    topic <- as.integer(input$topic.selected)
    idx <- as.integer(input$document.details.docid)

    if (is.na(topic) || is.na(idx)) { return() }

    rv <- paste("<p>", top.documents()[[topic]][idx], "</p>")
    return(HTML(rv))
  })

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

  # TODO(tfs): This will need to be updated for hierarchical kmeans, I believe
  meta.theta <- reactive({
    theta <- data()$model$theta
    mtheta <- matrix(0, nrow=nrow(theta), ncol=node.maxID())
    
    if (node.maxID() <= 0) {
      return(mtheta)
    }

    # for (topic in seq(K())) {
    #   # rv[[topic]] <- data()$doc.summaries[order(theta[,topic], decreasing=TRUE)[1:10]]

    #   mtheta[,assignments()[topic] - K()] <-
    #     mtheta[,assignments()[topic] - K()] + theta[,topic]
    # }

    for (clusterID in seq(K()+1, max.id())) {
      if (clusterID > length(leaf.ids()) || is.null(leaf.ids()[[clusterID]])) { next }
      
      leaves <- leaf.ids()[[clusterID]]

      for (leafID in leaves) {
        mtheta[,clusterID-K()] <- mtheta[,clusterID-K()] + theta[,leafID]
      }
    }

    return(mtheta)
  })

  top.documents <- reactive({
    rv <- list()
    theta <- data()$model$theta
    # meta.theta <- matrix(0, nrow=nrow(theta), ncol=length(assignments()) - K())
    for (topic in seq(K())) {
      rv[[topic]] <- data()$doc.summaries[order(theta[,topic], decreasing=TRUE)[1:100]]

      # meta.theta[,assignments()[topic] - K()] <-
      #   meta.theta[,assignments()[topic] - K()] + theta[,topic]
    }

    if (node.maxID() > 0) {
      for (meta.topic in seq(node.maxID())) {
        rv[[meta.topic + K()]] <- data()$doc.summaries[order(meta.theta()[,meta.topic],
                                                  decreasing=TRUE)[1:100]]
      }
    }

    return(rv)
  })

  thetas.selected <- reactive({
    topic.theta <- data()$model$theta
    topic <- as.integer(input$topic.active)

    if (is.na(topic)) {
      return(list())
    }

    if (topic <= K()) {
      # sorted <- sort.list(topic.theta[,topic], decreasing=TRUE)

      # NOTE(tfs): I'm not very familiar with the way R does things,
      #            but the above line does not produce values between 0 and 1.
      #            The following line is really ugly and I'm sure is not the
      #            best way to do this.
      sorted <- topic.theta[,topic][order(topic.theta[,topic], decreasing=TRUE)]
    } else {
      # sorted <- sort.list(meta.theta()[,topic-K()], decreasing=TRUE)

      sorted <- meta.theta()[,topic-K()][order(meta.theta()[,topic-K()], decreasing=TRUE)]
    }

    return(sorted)
  })

  # top.documents <- reactive({
  #   # TODO: this will need to be updated for hierarchy
  #   rv <- list()
  #   theta <- data()$model$theta
  #   meta.theta <- matrix(0, nrow=nrow(theta), ncol=length(assignments()) - K())
  #   for (topic in seq(K())) {
  #     rv[[topic]] <- data()$doc.summaries[order(theta[,topic], decreasing=TRUE)[1:10]]

  #     meta.theta[,assignments()[topic] - K()] <-
  #       meta.theta[,assignments()[topic] - K()] + theta[,topic]
  #   }

  #   for (meta.topic in seq(length(assignments()) - K())) {
  #     rv[[meta.topic + K()]] <- data()$doc.summaries[order(meta.theta[,meta.topic],
  #                                               decreasing=TRUE)[1:10]]
  #   }

  #   return(rv)
  # })

  # Top documents for selected topic/group
  documents <- reactive({
    topic <- as.integer(input$topic.active)

    if (is.na(topic) || topic == 0) {
      return("")
    }

    docs <- top.documents()[[topic]]
    thetas <- thetas.selected()
    rv <- ""
    # for (doc in top.documents()[[topic]]) {
    for (i in 1:length(top.documents()[[topic]])) {
      rv <- paste(rv, "<div class=\"document-summary\"",
                  paste("onclick=\"clickDocumentSummary(", toString(i), ")\">", sep=""),
                  "<div class=\"document-summary-fill\" style=\"width:",
                  paste(as.integer(thetas[i] * 100), "%;", sep=""),
                  "\"></div>",
                  "<p class=\"document-summary-contents\">",
                  substr(docs[i], start=1, stop=75),
                  "...</p>",
                  "</div>")
    }
    return(rv)
  })


  output$topic.document.title <- renderUI({
    return(HTML(topic.doctab.title()))
  })


  output$topic.documents <- renderUI({
    return(HTML(documents()))
  })  

  # output$topic.documents <- renderUI({
  #   # req(input$topic.active)
  #   rv <- paste("<h4 id=\"left-document-tab-cluster-title\">",
  #               topic.doctab.title(),
  #               "</h4>",
  #               "<div id=\"doctab-document-container\" class=\"topic-bar document-container\">",
  #               documents(),
  #               "</div>")

  #   return(HTML(rv))
  # })

  output$topicTabTitle <- renderUI({
    ostr <- paste("<h4 id=\"left-topic-tab-cluster-title\">", topic.topictab.title(), "</h4>")
    return(HTML(ostr))
  })

  observeEvent(input$updateTitle, {
    topic <- as.integer(input$topic.selected)

    newTitle <- input$topic.customTitle
    if (is.null(newTitle)) {
      newTitle = ""
    }

    stateStore$manual.titles[[topic]] <- newTitle
  })

  all.titles <- reactive({
    rv <- c()

    # n <- length(stateStore$assigns)
    n <- max.id()

    ttl <- c(titles(), cluster.titles())

    
    for (i in seq(n)) {
      # NOTE(tfs): Now separated this into a separate RV, allowing for easier processing
      # mtIndex <- ((i + K() - 1) %% n) + 1 # Shifts by 1 to allow for modulus while 1-indexing
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

  # TODO: this may not work for deeper hierarchy; needs to be checked once implemented
  cluster.titles <- reactive({
    if (is.null(data())) {
      return(c())
    }

    if (node.maxID() <= 0) {
      return(c())
    }

    marginals <- matrix(0, nrow=node.maxID(), ncol=ncol(beta()))
    weights <- colSums(data()$model$theta)

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
      title <- paste(data()$out$vocab[order(marginals[cluster,],
                                            decreasing=TRUE)][seq(5)], collapse=" ")

      rv <- c(rv, title)
    }

    return(rv)
  })

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

    wgt <- c(colSums(data()$model$theta))

    if (length(pid) > length(wgt)) {
      for (i in seq(length(pid) - length(wgt))) {
        wgt <- append(wgt, 0)
      }
    }

    rv <- data.frame(parentID=pid, nodeID=nid, weight=wgt, title=ttl)
    return(rv)
  })

  output$bubbles <- renderTopicBubbles({ topicBubbles(bubbles.data()) })

  output$tree <- renderTopicTree({ topicTree(bubbles.data()) })
}





