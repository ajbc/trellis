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
num.documents.shown <- 50

function(input, output, session) {
  # Initialize a single storage of state.
  # This will serve as the ground truth for the logic/data of the tool
  # assigns:
  #    Structured as a list such that each child is an "index" and the corresponding value is its parent
  #    NOTE: root is represented as "root"
  # collapsed.nodes:
  #    Similar to assigns in format, list of node ids
  #    with either a boolean value or a missing entry (corresponding to false)
  # flat.selection:
  #    Similar to collapsed.nodes
  #    Boolean flag (denoting whether a node is selected for a flat export) or a missing value (false)
  stateStore <- reactiveValues(manual.titles=list(), assigns=NULL, dataname="Data", collapsed.nodes=NULL, flat.selection=NULL)

  # Function used to select nodes for flatten mode
  find.level.children <- function(id, level) {
    if (id == 0) { id <- "root" }

    # Base cases: Reached correct level, reached leaf, or reached collapsed node
    if ((level <= 0) || (length(children()[[id]]) == 0)
        || (!is.null(stateStore$collapsed.nodes)
            && length(stateStore$collapsed.nodes) >= id
            && !is.na(stateStore$collapsed.nodes[[id]])
            && stateStore$collapsed.nodes[[id]])) {
      return(c(id))
    }

    # Recurse on all children of current node
    idlist <- c()
    for (ch in children()[[id]]) {
      idlist <- append(idlist, find.level.children(ch, level-1))
    }

    return(idlist)
  }

  # Provide all descendants of a node (as a list)
  all.descendant.ids <- function(id) {
    if (id == 0) { id <- "root" }

    # Base case
    if (length(children()[[id]]) == 0) {
      return(c(id))
    }

    # Recurse on children
    idlist <- c()
    for (ch in children()[[id]]) {
      idlist <- append(idlist, ch)
      idlist <- append(idlist, all.descendant.ids(ch))
    }

    return(idlist)
  }

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
      newA <- c() # Set up new assignments vector

      for (ch in seq(nrow(beta))) {
        newA[[ch]] <- 0 # Will be overwritten, but ensures that at least all assignments to 0 are made
      }

      for (pair in strsplit(aString, ",")[[1]]) {
        rel <- strsplit(pair, ":")[[1]] # Relation between two nodes

        newA[[as.integer(rel[[1]])]] <- as.integer(rel[[2]])
      }

      stateStore$assigns <- newA
    }

    if ("mantitles" %in% vals) {
      stateStore$manual.titles <- mantitles
    }

    if ("collapsed.flags" %in% vals) {
      stateStore$collapsed.nodes <- collapsed.flags
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
  shinyFileSave(input, 'exportflat', roots=c(home=file.home), session=session, restrictions=system.file(package='base'))

  observeEvent(input$savedata, {
    if (is.null(input$savedata)) {
      return(NULL)
    }

    collapsed.flags <- stateStore$collapsed.nodes # Rename to avoid collision later

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
          dataName=dataName, file=file, collapsed.flags=collapsed.flags)

    session$sendCustomMessage(type="clearSaveFile", "")
  })

  observeEvent(input$exportflat, {
    # Do nothing if we have no nodes to export
    if (is.null(stateStore$flat.selection)) { return() }

    idlist <- c()

    for (i in seq(max.id())) {
      if (length(stateStore$flat.selection) >= i
          && !is.na(stateStore$flat.selection[[i]]
          && stateStore$flat.selection[[i]])) {
        idlist <- append(idlist, i)
      }
    }

    # Create new matrices for beta and theta with new K (of flat model)
    flat.beta <- matrix(0, nrow=length(idlist), ncol=ncol(beta()))
    flat.theta <- matrix(0, nrow=nrow(data()$theta), ncol=length(idlist))

    flat.mantitles <- list()

    newAs = c()

    for (i in seq(length(idlist))) {
      flat.beta[i,] <- all.beta.weighted()[idlist[[i]],]
      flat.theta[,i] <- all.theta()[,idlist[[i]]]

      if (idlist[[i]] <= length(stateStore$manual.titles) && !is.null(stateStore$manual.titles[[idlist[[i]]]])) {
        flat.mantitles[[i]] <- stateStore$manual.titles[[idlist[[i]]]]
      }

      newAs <- append(newAs, paste(i, "0", sep=":"))
    }

    newAString <- paste(newAs, collapse=",")

    # All values to be saved
    sp <- parseSavePath(c(home=file.home), input$exportflat)
    file <- as.character(sp$datapath)
    beta <- flat.beta
    theta <- flat.theta
    filenames <- data()$filenames
    titles <- data()$doc.titles # Titles here refers to file titles
    vocab <- data()$vocab
    aString <- newAString
    mantitles <- flat.mantitles
    dataName <- chosenDataName()
    collapsed.flags <- NULL

    save(beta=beta, theta=theta, filenames=filenames, titles=titles,
          vocab=vocab, assignString=aString, manual.titles=mantitles,
          dataName=dataName, file=file, collapsed.flags=collapsed.flags)

    session$sendCustomMessage(type="clearFlatExportFile", "")
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
    shinyjs::show(selector=".right-content")
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
  all.beta.weighted <- reactive({
    leaf.beta <- beta()
    lids <- leaf.ids()
    weights <- colSums(data()$theta)

    # Initialzie matrix for beta values
    ab <- matrix(0, nrow=max.id(), ncol=ncol(leaf.beta))

    for (l in seq(K())) {
      ab[l,] <- leaf.beta[l,] * weights[l]
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

  observeEvent(input$collapseNode, {
    req(data())

    if (is.null(input$collapseNode)) {
      return()
    }

    rawNodeID <- input$collapseNode[[1]]

    if (is.null(rawNodeID) || is.na(as.integer(rawNodeID)) || is.null(as.integer(rawNodeID))) {
      return()
    }

    if (as.integer(rawNodeID) < 1) {
      return()
    }

    if (as.integer(rawNodeID) <= K()) {
      return()
    }

    stateStore$collapsed.nodes[[as.integer(rawNodeID)]] <- TRUE
  })

  observeEvent(input$expandNode, {
    req(data())

    if (is.null(input$expandNode)) {
      return()
    }

    rawNodeID <- input$expandNode[[1]]

    if (is.null(rawNodeID) || is.na(as.integer(rawNodeID)) || is.null(as.integer(rawNodeID))) {
      return()
    }

    if (as.integer(rawNodeID) < 1) {
      return()
    }

    stateStore$collapsed.nodes[[as.integer(rawNodeID)]] <- FALSE
  })

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
  topic.topictab.title <- reactive({
    if (input$topic.selected == "") {
      return("Please Select a topic")
    }

    topic <- as.integer(input$topic.selected)

    if (topic == 0) { return("[ROOT]") }

    return(sanitize(all.titles()[topic], type="html"))
  })

  topic.vocabtab.title <- reactive({
    if (input$topic.active == "") {
      return ("Please select a topic")
    }

    topic <- as.integer(input$topic.active)

    if (topic == 0) { return("[ROOT]") }

    return(sanitize(all.titles()[topic], type="html"))
  })

  observeEvent(input$updateAssignments, {
    # Fields: sourceID, targetID, makeNewGroup, timestamp
    if (is.null(input$updateAssignments)) {
      return()
    }

    # NOTE(tfs; 2018-07-04): Currently this relies on the frontend preventing
    #                        any node targeting one of its descendants

    source.id <- input$updateAssignments[[1]]
    target.id <- input$updateAssignments[[2]]
    shift.held <- input$updateAssignments[[3]]

    # Leaf checks currently rely on all initial topics (leaves) to have IDs 1-K()
    source.is.leaf <- (source.id <= K() && K() > 0)
    target.is.leaf <- (target.id <= K() && target.id > 0)

    # Leaves (original topics) remain leaves
    if (target.is.leaf) { return() }

    if (source.id == target.id) { return() }

    empty.id <- source.id

    if (shift.held) {
      if (source.is.leaf || stateStore$assigns[[source.id]] == target.id) {
        # Shift is held, source is leaf or source is child of target
        #   Generates new node
        empty.id <- stateStore$assigns[[source.id]]

        newID <- max.id() + 1
        stateStore$assigns[[newID]] <- target.id
        stateStore$assigns[[source.id]] <- newID
      } else {
        # Shift is held, source is an aggregate node
        empty.id <- stateStore$assigns[[source.id]]

        stateStore$assigns[[source.id]] <- target.id
      }
    } else {
      if (stateStore$assigns[[source.id]] == target.id) {
        return()
      }

      if (source.is.leaf) {
        empty.id <- stateStore$assigns[[source.id]]

        # Move a single leaf node
        stateStore$assigns[[source.id]] <- target.id
      } else {
        # Move all children of the source node
        for (ch in children()[[source.id]]) {
          stateStore$assigns[[ch]] <- target.id
        }

        empty.id <- source.id
      }
    }

    # Clean up if the update emptied a node
    while(empty.id > 0 && (empty.id > length(leaf.ids()) || is.null(leaf.ids()[[empty.id]]) || length(leaf.ids()[[empty.id]]) <= 0)) {
      nid <- stateStore$assigns[[empty.id]]
      stateStore$assigns[[empty.id]] <- NA
      empty.id <- nid
    }
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


  # Only enable the flat export button if something is selected
  observe({
    shinyjs::toggleState("exportflat", !is.null(stateStore$flat.selection))
  })


  # Update the flat selection state
  observeEvent(input$flat.node.selection, {
    req(data())

    if (is.null(input$flat.node.selection)) { return() }

    # Exclude timestamp, which is used to ensure difference in input value
    nodeID <- as.integer(input$flat.node.selection[[1]])
    
    # Handle edge case of root, equivalent of deselcting
    # (A one-node topic model isn't very interesting)
    if (nodeID == 0) {
      stateStore$flat.selection = NULL
      return()
    }

    # Error case. Shouldn't happen.
    if (length(stateStore$assigns) < nodeID) {
      stateStore$flat.selection = NULL
      return()
    }

    # If nothing is currently selected, select all nodes of the appropriate level
    if (is.null(stateStore$flat.selection)) {
      stateStore$flat.selection <- c()

      level <- 1
      p <- stateStore$assigns[[nodeID]]

      while (p > 0) {
        level <- level + 1
        p <- stateStore$assigns[[p]]
      }

      idlist <- find.level.children(0, level)
      for (id in idlist) {
        stateStore$flat.selection[[id]] <- TRUE
      }

      return()
    }

    # If node is already selected, do nothing
    if (!is.null(stateStore$flat.selection)
        && length(stateStore$flat.selection) >= nodeID
        && !is.na(stateStore$flat.selection[[nodeID]])
        && stateStore$flat.selection[[nodeID]]) {
      return()
    }

    level <- 1
    p <- stateStore$assigns[[nodeID]]
    ancestor.flag <- FALSE

    # Check if an ancestor of the current node is already selected.
    #    If so, select all nodes at the same level as the node id provided
    while (p > 0) {
      # Cases where p is not yet root, but is not collapsed (keep iterating)
      if (p > length(stateStore$flat.selection)
          || is.null(stateStore$flat.selection[[p]])
          || is.na(stateStore$flat.selection[[p]])) {
        p <- stateStore$assigns[[p]]
        level <- level + 1
        next
      }

      # If p is selected, note the level and select all of same level
      # Deselect p
      if (!is.null(stateStore$flat.selection[[p]]) && stateStore$flat.selection[[p]]) {
        stateStore$flat.selection[[p]] <- FALSE # Deselect p
        ancestor.flag <- TRUE
        break
      }

      level <- level + 1
      p <- stateStore$assigns[[p]]
    }

    # If an ancestor of the specified node was previously selected,
    #    select all of that ancestors leaves or descendants at the same level as
    #    the specified node, whichever is shallower
    if (ancestor.flag) {
      idlist <- find.level.children(p, level)

      # Label all ids
      for (id in idlist) {
        stateStore$flat.selection[[id]] <- TRUE
      }

      return()
    }

    # Select current node
    stateStore$flat.selection[[nodeID]] <- TRUE

    # Deselect all descendants of original node
    idlist <- all.descendant.ids(nodeID)

    for (id in idlist) {
      stateStore$flat.selection[[id]] <- FALSE
    }
  })


  # Clears selection, used when exiting flat export more
  observeEvent(input$clear.flat.selection, {
    stateStore$flat.selection = NULL
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

  # Boolean value for each node, noting whether or not the node is a descendant of a collapsed node
  is.collapsed.descendant <- reactive({
    req(data())

    rv <- c()

    # Iterate over all potential ids
    for (ch in seq(max.id())) {
      p <- stateStore$assigns[[ch]] # Parent/ancestor iterator

      rv[[ch]] <- FALSE # Default value: NOT a descendant of a collapsed node

      # Simple cases (default value holds)
      if (is.null(stateStore$collapsed.nodes)) { next }
      if (is.null(p) || is.na(p) || p <= 0) { next }

      # Iterate up all ancestors in the hierarchy, checking collapsed status
      while (p > 0) {
        # Cases where p is not yet root, but is not collapsed (keep iterating)
        if (p > length(stateStore$collapsed.nodes)
            || is.null(stateStore$collapsed.nodes[[p]])
            || is.na(stateStore$collapsed.nodes[[p]])) {
          p <- stateStore$assigns[[p]]
          next
        }

        # If p is collapsed, set the flag to TRUE and advance to next node
        if (!is.null(stateStore$collapsed.nodes[[p]]) && stateStore$collapsed.nodes[[p]]) {
          rv[[ch]] <- TRUE
          break
        }

        p <- stateStore$assigns[[p]]
      }
    }

    return(rv)
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

    return(all.beta.weighted()[childIDs,])
  })

  # Returns the highest ID of any cluster, offset by the number of leaf nodes (K())
  # TODO(tfs; 2018-07-07): Rename this, cluster.maxID or something similar
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
    }, error = function (e) {
      print("Error while loading file")
      print(e)
      print("------------------------")
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

  all.theta <- reactive({
    theta <- data()$theta
    cols <- colSums(theta)

    at <- matrix(0, nrow=nrow(theta), ncol=max.id())

    for (i in seq(max.id())) {
      if (i <= K()) {
        at[,i] <- theta[,i]
      } else {
        at[,i] <- meta.theta()[,i-K()]
      }
    }

    return(at)
  })

  # TODO(tfs): Phase this out in favor of dynamically displaying an increasing number
  #            of document titles on the left panel
  last.shown.docidx <- reactive({
    return(min(num.documents(), num.documents.shown))
  })

  # Sorted top vocab terms for each topic
  top.vocab <- reactive({
    # TODO(tfs; 2018-07-07): Rework for dynamic loading
    rv <- list()
    ab <- all.beta.weighted()

    for (topic in seq(max.id())) {
      # Currently showing the same number of vocab terms as documents
      rv[[topic]] <- data()$vocab[order(ab[topic,], decreasing=TRUE)[1:last.shown.docidx()]]
    }

    return(rv)
  })

  # List of document titles, sorted by topic relevance, for all topics and meta topics/clusters
  top.documents <- reactive({
    # TODO(tfs; 2018-07-07): Rework this. Make use of all.theta() and enable dynamic loading

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

  # TODO(tfs; 2018-07-07): Rename to reflect sorted nature
  # SORTED selected betas
  betas.selected <- reactive({
    topic <- as.integer(input$topic.active)

    if (is.na(topic)) { return(list()) }

    sorted <- all.beta.weighted()[topic,][order(all.beta.weighted()[topic,], decreasing=TRUE)]

    return(sorted)
  })

  # TODO(tfs; 2018-07-07): Rename to reflect sorted nature
  # Returns the SORTED theta values of all documents corresponding to the selected topic
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


  topic.vocab <- reactive({
    topic <- as.integer(input$topic.active)

    if (is.na(topic) || topic == 0) {
      return("")
    }

    terms <- top.vocab()[[topic]]
    betas <- betas.selected()
    rv <- ""

    for (i in 1:length(terms)) {
      rv <- paste(rv, "<div class=\"vocab-summary\">",
                  "<div class=\"vocab-summary-fill\" style=\"width:",
                  paste(as.integer(betas[i] * 100), "%;", sep=""),
                  "\"></div>",
                  "<p class=\"vocab-summary-contents\">",
                  sanitize(terms[i]),
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


  output$topic.vocab <- renderUI({
    return(HTML(topic.vocab()))
  })

  # Display title of the selected topic (vocab tab)
  output$topic.vocabtab.title <- renderUI({
    ostr <- paste("<h4 id=\"left-vocab-tab-cluster-title\">", topic.vocabtab.title(), "</h4>")
    return(HTML(ostr))
  })

  # When user presses the update title button, store the update into backend stateStore
  observeEvent(input$updateTitle, {
    topic <- as.integer(input$topic.selected)

    newTitle <- isolate(input$topic.customTitle)

    if (is.null(newTitle)) {
      newTitle = ""
    }

    stateStore$manual.titles[[topic]] <- newTitle

    session$sendCustomMessage("cleanTitleInput", "")
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

    pid <- c() # Parent ids
    nid <- c() # Node ids (children, but will serve as the basic node id for each topic in the widgets)
    ttl <- c() # Titles, aggregating manual and automatic
    clp <- c() # Collapsed node flags
    wgt <- c()
    ilf <- c() # Denotes nodes that are true leaves (simplifies storage/representation of collapsed nodes)
    flt <- c() # Flat model export, node selection flags

    # n <- length(stateStore$assigns)
    n <- max.id()

    cols <- c(colSums(data()$theta)) # Weights for each node, based on representation in the corpus

    for (ch in seq(n)) {
      if (is.collapsed.descendant()[[ch]]) { next } # Skip descendants of collapsed nodes
      if (is.na(stateStore$assigns[[ch]])) { next } # Continue
      nid <- append(nid, ch)
      pid <- append(pid, stateStore$assigns[ch])
      ttl <- append(ttl, all.titles()[[ch]])

      if (!is.null(stateStore$flat.selection) && ch <= length(stateStore$flat.selection) && !is.null(stateStore$flat.selection[[ch]])) {
        flt <- append(flt, stateStore$flat.selection[[ch]])
      } else {
        flt <- append(flt, FALSE)
      }
      
      if (ch <= K()) { wgt <- append(wgt, cols[[ch]]) }

      # isLeaf is dependent on all original topics being given the first K ids
      if (ch <= K()) {
        ilf <- append(ilf, TRUE)
      } else {
        ilf <- append(ilf, FALSE)
      }

      # Handle collapsed node flags, filling in FALSE for missing entries
      if (ch <= length(stateStore$collapsed.nodes) && !(is.na(stateStore$collapsed.nodes[[ch]]))) {
        clp <- append(clp, stateStore$collapsed.nodes[[ch]])
      } else {
        clp <- append(clp, FALSE)
      }
    }

    if (max.id() > K()) {
      for (i in seq(max.id() - K())) {
        ind <- i + K()

        if (is.na(stateStore$assigns[[ind]]) || is.collapsed.descendant()[[ind]]) { next }

        if (ind <= length(stateStore$collapsed.nodes) && !is.null(stateStore$collapsed.nodes[[ind]]) && !is.na(stateStore$collapsed.nodes[[ind]]) && stateStore$collapsed.nodes[[ind]]) {
          # Aggregate weight on backend for collapsed nodes
          newWgt <- 0

          for (l in leaf.ids()[[i + K()]]) {
            newWgt <- newWgt + cols[[l]]
          }

          wgt <- append(wgt, newWgt)
        } else {
          wgt <- append(wgt, 0)
        }
      }
    }

    rv <- data.frame(parentID=pid, nodeID=nid, weight=wgt, title=ttl, collapsed=clp, isLeaf=ilf, flatSelected=flt)
    return(rv)
  })

  # Render bubble widget
  output$bubbles <- renderTopicBubbles({ topicBubbles(bubbles.data()) })

  # Render tree widget
  output$tree <- renderTopicTree({ topicTree(bubbles.data()) })
}





