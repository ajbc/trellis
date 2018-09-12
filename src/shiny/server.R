library(shiny)
library(shinyjs)
library(jsonlite)
library(stm)
library(data.table)
library(htmlwidgets)
library(topicBubbles)
library(topicTree)
library(xtable) # Used to sanitize output
library(Matrix) # Used for sparse beta
library(irlba)  # Used for fast SVD
library(rsvd)   # Used for alternate SVD (high dimension compared to number of topics)


options(shiny.maxRequestSize=1e4*1024^2)


# NOTE(tfs): Constants in use for now. The goal is to remove
#            `num.documents.shown` in favor of dynamically loading
#            more documents on the left panel as the user scrolls
file.home <- "~"
num.documents.shown <- 100
volumes <- c(Home = file.home, getVolumes()())


# Parameters for making beta sparse and performing SVD before performing kmeans clustering
beta.threshold <- 0.0001
beta.svd.dim <- 20
beta.svd.ratio <- 4


# TODO(tfs; 2018-08-14): MINIMIZE USE OF $ ACCESSOR
#                        According to the profvis profiler, $ seems to be very slow
#                        (at least for reactiveValuse)


function(input, output, session) {
  # Initialize a single storage of state.
  # This will serve as the ground truth for the logic/data of the tool
  # manual.titles:
  #    List of titles set by the user, associated topic IDs
  # assigns:
  #    Structured as a list such that each child is an "index" and the corresponding value is its parent
  #    NOTE: root is represented as "root"
  # child.map:
  #    NULL or list, indexed by toString([topic_id_number]). Stores list of all children of each topic
  # leaf.map:
  #    Similar to child.map, but stores list of all leaves of a given topic
  # dataname:
  #    The name, provided by the user, to be displayed at the top left of Trellis
  # collapsed.nodes:
  #    Similar to assigns in format, list of node ids
  #    with either a boolean value or a missing entry (corresponding to false)
  # flat.selection:
  #    Similar to collapsed.nodes
  #    Boolean flag (denoting whether a node is selected for a flat export) or a missing value (false)
  # all.theta:
  #    A matrix storing all theta values for original and aggregate topics
  # all.beta:
  #    A matrix storing all beta values for original and aggregate topics
  # calculated.titles:
  #    Vector of titles calculated by taking the 5 highets-weighted words from a topic's beta values
  # display.titles:
  #    Vector of titles: manual title if provided, else calculated title
  # top.documents.order:
  #    List, indexed by topic id, giving the order result of sorting that topic's theta values
  # top.vocab.order:
  #    List, indexed by topic id, giving the order result of sorting that topic's beta values

  # TODO(tfs; 2018-08-14): For speed, it looks (according to profvis) like we should switch to global variables.
  #                        We could then use reactiveValues as a flag or set of flags to update outputs
  stateStore <- reactiveValues(manual.titles=list(),
                               assigns=NULL,
                               child.map=NULL,
                               leaf.map=NULL,
                               dataname="Data",
                               collapsed.nodes=NULL,
                               flat.selection=NULL,
                               all.theta=NULL,
                               all.beta=NULL,
                               calculated.titles=NULL,
                               display.titles=NULL,
                               top.documents.order=NULL,
                               top.vocab.order=NULL)

  # Function used to select nodes for flatten mode
  find.level.children <- function(id, level) {
    # Base cases: Reached correct level, reached leaf, or reached collapsed node
    if ((level <= 0) || (length(stateStore$child.map[[toString(id)]]) == 0)
        || ((id > 0)
            && !is.null(stateStore$collapsed.nodes)
            && length(stateStore$collapsed.nodes) >= id
            && !is.na(stateStore$collapsed.nodes[[id]])
            && stateStore$collapsed.nodes[[id]])) {
      return(c(id))
    }

    # Recurse on all children of current node
    idlist <- c()
    for (ch in stateStore$child.map[[toString(id)]]) {
      idlist <- append(idlist, find.level.children(ch, level-1))
    }

    return(idlist)
  }


  # Provide all descendants of a node (as a list)
  all.descendant.ids <- function(id) {
    if (id == 0) { id <- "root" }

    # Base case
    if (length(stateStore$child.map[[toString(id)]]) == 0) {
      return(c(id))
    }

    # Recurse on children
    idlist <- c()
    for (ch in stateStore$child.map[[toString(id)]]) {
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
  output$topic.chosenName <- renderText({
    return(chosenDataName())
  })

  # Display the name of the selected model file
  output$modelfile.name <- renderText({
    if (!is.null(input$modelfile)) {
      name <- as.character(parseFilePaths(volumes, input$modelfile)$datapath)
      return(HTML(sanitize(name)))
    } else {
      return(HTML(""))
    }
  })


  init.all.beta <- function() {
    leaf.beta <- beta()
    weights <- colSums(data()$theta)

    ab <- matrix(0, nrow=max.id(), ncol=ncol(leaf.beta))

    ab[seq(K()),] <- leaf.beta[seq(K()),]

    # Use beta values of leaves (intial topics) to calculate aggregate beta values for meta topics/clusters
    if (max.id() > K()) {
      for (clusterID in seq(K()+1, max.id())) {
        if (is.na(stateStore$assigns[[clusterID]])) { next }

        leaves <- stateStore$leaf.map[[toString(clusterID)]]

        vals <- leaf.beta[leaves,] * weights[leaves]

        if (!is.null(dim(vals)) && dim(vals) > 1) {
          vals <- colSums(vals)
        }

        vals <- vals / sum(vals)

        # Normalize the new distribution
        ab[clusterID,] <- vals / sum(vals)
      }
    }

    stateStore$all.beta <- ab
  }


  init.all.theta <- function(ids) {
    theta <- data()$theta

    at <- matrix(0, nrow=nrow(theta), ncol=max.id())

    for (i in seq(max.id())) {
      if (i <= K()) {
        at[,i] <- theta[,i]
      } else {
        if (is.null(stateStore$leaf.map[[toString(i)]])) { next }

        leaves <- stateStore$leaf.map[[toString(i)]]

        vals <- theta[,leaves]

        if (length(leaves) > 1) {
          vals <- rowSums(vals)
        }

        at[,i] <- vals
      }
    }

    stateStore$all.theta <- at
  }


  init.calculated.titles <- function() {
    if (is.null(data())) { return() }

    ab <- stateStore$all.beta

    rv <- c()
    for (cluster in seq(max.id())) {
      title <- paste(data()$vocab[stateStore$top.vocab.order[[cluster]][seq(5)]], collapse=" ")

      rv <- c(rv, title)
    }

    stateStore$calculated.titles <- rv
  }


  init.display.titles <- function() {
    rv <- c()

    n <- max.id()

    ttl <- stateStore$calculated.titles

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

    stateStore$display.titles <- rv
  }


  init.top.documents.order <- function() {
    rv <- list()
    at <- stateStore$all.theta
    for (topic in seq(max.id())) {
      rv[[topic]] <- order(at[,topic], decreasing=TRUE)[1:last.shown.docidx()]
    }

    stateStore$top.documents.order <- rv
  }


  init.top.vocab.order <- function() {
    # TODO(tfs; 2018-07-07): Rework for dynamic loading
    rv <- list()
    ab <- stateStore$all.beta

    for (topic in seq(max.id())) {
      # Currently showing the same number of vocab terms as documents
      rv[[topic]] <- order(ab[topic,], decreasing=TRUE)[1:last.shown.docidx()]
    }

    stateStore$top.vocab.order <- rv
  }


  clean.aggregate.state <- function(ids) {
    clean.all.beta(ids)
    clean.all.theta(ids)
    clean.calculated.titles(ids)
    clean.display.titles(ids)
  }


  clean.all.beta <- function(ids) {
    if (length(ids) <= 0) { return() }

    for (i in ids) {
      if (i <= K() || i > nrow(stateStore$all.beta)) { next }
      stateStore$all.beta[i,] <- 0
    }

    # Prune end rows
    zidx <- which(rowSums(abs(stateStore$all.beta)) == 0)
    zidx <- zidx[zidx > K()]
    zidx <- zidx[order(zidx, decreasing=TRUE)]

    for (i in zidx) {
      if (i == nrow(stateStore$all.beta)) {
        stateStore$all.beta <- stateStore$all.beta[-i,]
      }
    }
  }


  clean.all.theta <- function(ids) {
    if (length(ids) <= 0) { return() }

    for (i in ids) {
      if (i <= K() || i > ncol(stateStore$all.theta)) { next }
      stateStore$all.theta[,i] <- 0
    }

    # Prune end cols
    zidx <- which(colSums(abs(stateStore$all.theta)) == 0)
    zidx <- zidx[zidx > K()]
    zidx <- zidx[order(zidx, decreasing=TRUE)]

    for (i in zidx) {
      if (i == ncol(stateStore$all.theta)) {
        stateStore$all.theta <- stateStore$all.theta[,-i]
      }
    }
  }


  clean.calculated.titles <- function(ids) {
    for (i in ids) {
      stateStore$calculated.titles[[i]] <- NA
    }
  }


  clean.display.titles <- function(ids) {
    for (i in ids) {
      stateStore$calculated.titles[[i]] <- NA
    }
  }


  update.all.aggregate.state <- function() {
    ids <- seq(max.id())
    update.aggregate.state(ids, c())
  }


  # TODO(tfs; 2018-08-14): Switch to using children rather than leaves
  update.aggregate.state <- function(changedIDs, newIDs) {
    update.all.beta(changedIDs, newIDs)
    update.all.theta(changedIDs, newIDs)
    update.top.documents.order(changedIDs, newIDs)
    update.top.vocab.order(changedIDs, newIDs)
    update.calculated.titles(changedIDs, newIDs)
    update.display.titles(changedIDs, newIDs)
  }


  # TODO(tfs; 2018-08-14): According to profvis, most of the time spent updating is in this method.
  #                        Should switch over to something more detailed, similar to CM, LM, assigns
  update.all.beta <- function(changedIDs, newIDs) {
    leaf.beta <- beta()

    weights <- colSums(data()$theta)

    if (length(newIDs) > 0) {
      numNewRows = max(newIDs) - nrow(stateStore$all.beta)

      if (numNewRows > 0) {
        newmat <- matrix(0, nrow=numNewRows, ncol=ncol(leaf.beta))
        stateStore$all.beta <- rbind(stateStore$all.beta, newmat)
      }
    }

    # Use beta values of leaves (intial topics) to calculate aggregate beta values for meta topics/clusters
    if (max.id() > K()) {
      for (clusterID in append(changedIDs, newIDs)) {
        if (clusterID <= K()) { next } # We never need to update leaf values
        if (is.na(stateStore$assigns[[clusterID]])) { next }

        leaves <- stateStore$leaf.map[[toString(clusterID)]]

        vals <- leaf.beta[leaves,] * weights[leaves]

        if (!is.null(dim(vals)) && dim(vals) > 1) {
          vals <- colSums(vals)
        }

        # Normalize the new distribution
        vals <- vals / sum(vals)

        stateStore$all.beta[clusterID,] <- vals
      }
    }
  }


  update.all.theta <- function(changedIDs, newIDs) {
    theta <- data()$theta

    if (length(newIDs) > 0) {
      numNewCols = max(newIDs) - ncol(stateStore$all.theta)

      if (numNewCols > 0) {
        newmat <- matrix(0, nrow=nrow(theta), ncol=numNewCols)
        stateStore$all.theta <- cbind(stateStore$all.theta, newmat)
      }
    }

    for (i in append(changedIDs, newIDs)) {
      if (i <= K()) { next } # We never need to update leaf values
      if (is.null(stateStore$leaf.map[[toString(i)]])) { next }

      leaves <- stateStore$leaf.map[[toString(i)]]

      vals <- theta[,leaves]

      if (length(leaves) > 1) {
        vals <- rowSums(vals)
      }

      stateStore$all.theta[,i] <- vals
    }
  }


  update.calculated.titles <- function(changedIDs, newIDs) {
    ab <- stateStore$all.beta

    for (i in append(changedIDs, newIDs)) {
      if (i <= K()) { next } # We shouldn't need to ever update the calculated title of a leaf

      title <- paste(data()$vocab[order(ab[i,], decreasing=TRUE)][seq(5)], collapse=" ")

      stateStore$calculated.titles[[i]] <- title
    }
  }


  update.display.titles <- function(changedIDs, newIDs) {
    ttl <- stateStore$calculated.titles

    for (i in append(changedIDs, newIDs)) {
      if (i == 0) { next } # Never change root title

      title <- ""

      if (i > length(stateStore$manual.titles)
      || is.null(stateStore$manual.titles[[i]])
      || stateStore$manual.titles[[i]] == "") {
        if (i > length(ttl) 
        || is.null(ttl[[i]])
        || i > length(stateStore$assigns)
        || is.null(stateStore$assigns[[i]])) {
          title <- ""
        } else {
          title <- ttl[[i]]
        }
      } else {
        title <- stateStore$manual.titles[[i]]
      }

      stateStore$display.titles[[i]] <- title
    }
  }


  update.top.documents.order <- function(changedIDs, newIDs) {
    for (topic in (append(changedIDs, newIDs))) {
      if (topic <= K()) { next }

      stateStore$top.documents.order[[topic]] <- order(stateStore$all.theta[,topic], decreasing=TRUE)
    }
  }


  update.top.vocab.order <- function(changedIDs, newIDs) {
    for (topic in append(changedIDs, newIDs)) {
      if (topic <= K()) { next }

      stateStore$top.vocab.order[[topic]] <- order(stateStore$all.beta[topic,], decreasing=TRUE)
    }
  }


  # Display the name of the selected text directory
  output$textdirectory.name <- renderText({
    if (!is.null(input$textlocation)) {
      name <- as.character(parseDirPath(volumes, isolate(input$textlocation)))
      return(HTML(sanitize(name)))
    } else {
      return(HTML(""))
    }
  })


  # Load data from provided model file and path to directory containing text files (if provided)
  data <- reactive({
    if (is.null(isolate(input$modelfile)))
      return(NULL)

    # Build full file name
    path <- parseFilePaths(volumes, isolate(input$modelfile))

    # Loads `beta`, `theta`, `filenames`, `titles`, and `vocab`
    load(as.character(path$datapath))

    # Optionally load pre-saved data
    vals <- ls()

    if ("dataName" %in% vals) {
      stateStore$dataname <- dataName
    }

    if ("aString" %in% vals) {
      newA <- c()     # Set up new assignments vector
      newCM <- list() # Set up new childmap
      newLM <- list() # Set up new leafmap

      newCM[[toString(0)]] <- c()

      for (ch in seq(nrow(beta))) {
        newA[[ch]] <- 0 # Will be overwritten, but ensures that at least all assignments to 0 are made
        newCM[[toString(ch)]] <- c()
      }

      # Walk through all assignment pairs
      for (pair in strsplit(aString, ",")[[1]]) {
        rel <- strsplit(pair, ":")[[1]] # Relation between two nodes

        ch <- as.integer(rel[[1]])
        p <- as.integer(rel[[2]])

        newA[[ch]] <- p # Assign parent based on parsed pair

        # Add ch to p's child map
        if (!(ch %in% newCM[[toString(p)]])) {
          newCM[[toString(p)]] <- append(newCM[[toString(p)]], ch)
        }
      }

      # Add root's children to root's child.map
      for (i in seq(max(nrow(beta), max(newA[!is.na(newA)])))) {
        if (!is.na(newA[[i]]) && newA[[i]] == 0) {
          newCM[[toString(0)]] <- append(newCM[[toString(0)]], i)
        }

        newLM[[toString(i)]] <- c()
      }

      for (i in seq(nrow(beta))) {
        newLM[[toString(i)]] <- c(i) # All leaves are their own (singleton) leafset
        p <- newA[[i]]

        while(p > 0) {
          newLM[[toString(p)]] <- append(newLM[[toString(p)]], i)
          p <- newA[[p]]
        }
      }

      stateStore$leaf.map <- newLM
      stateStore$child.map <- newCM
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
      document.location <- as.character(parseDirPath(volumes, isolate(input$textlocation)))
    }

    # Tell frontend to initiate clearing of:
    #     * input[["textlocation-modal"]]
    #     * input[["textlocation"]]
    #     * input[["modelfile-modal"]]
    #     * input[["modelfile"]]
    # To free up resources (shinyFiles seems to be fairly expensive/have a fairly high performance impact otherwise)
    session$sendCustomMessage(type="clearFileInputs", "")

    # Remove the global variables so we don't store all our information twice
    rl <- list("beta"=beta, "theta"=theta, "filenames"=filenames, "doc.titles"=titles, "document.location"=document.location, "vocab"=vocab)
    rm(beta)
    rm(theta)
    rm(filenames)
    rm(titles)
    rm(document.location)
    rm(vocab)
    return(rl)
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
  shinyFileChoose(input, 'modelfile', roots=volumes, session=session, restrictions=system.file(package='base'))
  shinyDirChoose(input, 'textlocation', roots=volumes, session=session, restrictions=system.file(package='base'))
  shinyFileSave(input, 'savedata', roots=volumes, session=session, restrictions=system.file(package='base'))
  shinyFileSave(input, 'exportflat', roots=volumes, session=session, restrictions=system.file(package='base'))


  observeEvent(input$savedata, {
    if (is.null(input$savedata) || nrow(parseSavePath(volumes, input$savedata)) <= 0) {
      return(NULL)
    }

    collapsed.flags <- stateStore$collapsed.nodes # Rename to avoid collision later

    # All values to be saved
    sp <- parseSavePath(volumes, input$savedata)
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
    if (is.null(stateStore$flat.selection) || nrow(parseSavePath(volumes, input$exportflat)) <= 0) { return() }

    idlist <- c()

    for (i in seq(max.id())) {
      if ((length(stateStore$flat.selection) >= i)
          && (!is.na(stateStore$flat.selection[[i]])
          && (stateStore$flat.selection[[i]]))) {
        idlist <- append(idlist, i)
      }
    }

    # Create new matrices for beta and theta with new K (of flat model)
    flat.beta <- matrix(0, nrow=length(idlist), ncol=ncol(beta()))
    flat.theta <- matrix(0, nrow=nrow(data()$theta), ncol=length(idlist))

    flat.mantitles <- list()

    newAs = c()

    for (i in seq(length(idlist))) {
      flat.beta[i,] <- stateStore$all.beta[idlist[[i]],]
      flat.theta[,i] <- stateStore$all.theta[,idlist[[i]]]

      if (idlist[[i]] <= length(stateStore$manual.titles) && !is.null(stateStore$manual.titles[[idlist[[i]]]])) {
        flat.mantitles[[i]] <- stateStore$manual.titles[[idlist[[i]]]]
      }

      newAs <- append(newAs, paste(i, "0", sep=":"))
    }

    newAString <- paste(newAs, collapse=",")

    # All values to be saved
    sp <- parseSavePath(volumes, input$exportflat)
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
          dataName=dataName, collapsed.flags=collapsed.flags, file=file)

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
      initCM <- list()
      if (input$initialize.kmeans) {
        fit <- initial.kmeansFit()
        initAssigns <- c(fit$cluster + K(), rep(0, input$initial.numClusters))

        initCM[[toString(0)]] <- c(K() + seq(input$initial.numClusters))

        for (i in seq(input$numNewClusters)) {
          initCM[[toString(i + K())]] <- c()
        }

        for (i in seq(K())) {
          initCM[[toString(initAssigns[[i]])]] <- append(initCM[[toString(initAssigns[[i]])]], i)
        }
      } else {
        initAssigns <- c(rep(0, K()))
        initCM[[toString(0)]] <- seq(K())

        for (i in seq(K())) {
          initCM[[toString(i)]] <- c()
        }
      }

      initLM <- list()

      for (i in seq(max(K(), max(initAssigns[!is.na(initAssigns)])))) {
        initLM[[toString(i)]] <- c()
      }

      for (i in seq(K())) {
        initLM[[toString(i)]] <- c(i) # A leaf is the only memeber in it's own leafmap entry

        p <- initAssigns[[i]]

        while(p > 0) {
          initLM[[toString(p)]] <- append(initLM[[toString(p)]], i)
          p <- initAssigns[[p]]
        }
      }

      stateStore$leaf.map <- initLM
      stateStore$child.map <- initCM
      stateStore$assigns <- initAssigns
    }

    init.all.beta()
    init.all.theta()
    init.top.documents.order()
    init.top.vocab.order()
    init.calculated.titles()
    init.display.titles()

    req(bubbles.data()) # Similarly ensures that bubbles.data() finishes running before displays transition

    shinyjs::hide(selector=".initial")
    shinyjs::show(selector=".left-content")
    shinyjs::show(selector=".main-content")
    shinyjs::show(selector=".right-content")
    shinyjs::show(selector="#document-details-container")
    session$sendCustomMessage(type="initializeMainView", "")
  })


  observeEvent(input$selectedView, {
    messageType <- paste0("switchMainViewTo", input$selectedView[[1]])

    session$sendCustomMessage(messageType, toString(input$topic.selected))
  })


  observeEvent(input$bubble.initialized, {
    session$sendCustomMessage("switchMainViewToBubbles", toString(input$topic.selected))
  })


  observeEvent(input$tree.initialized, {
    session$sendCustomMessage("switchMainViewToTree", toString(input$topic.selected))
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
      session$sendCustomMessage("clusterNotification", "")

      # Create a sparse matrix (shrinking small beta values to 0), then use SVD.
      #    Use the resulting (much smaller) matrix to run kmeans clustering
      bet <- beta()

      sparse <- Matrix(0, nrow=nrow(bet), ncol=ncol(bet), sparse=TRUE)
      mask <- (bet > beta.threshold)
      sparse[mask] <- bet[mask]

      if (nrow(sparse) > beta.svd.dim * beta.svd.ratio) {
        singular <- ssvd(sparse, k=min(nrow(sparse)-1, beta.svd.dim))$u
      } else {
        singular <- rsvd(sparse, k=min(nrow(sparse)-1, beta.svd.dim))$u
      }

      return(kmeans(singular, input$initial.numClusters)) 
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
    session$sendCustomMessage("clusterNotification", "")

    # Generate a sparse beta matrix and run SVD before running kmeans
    cb <- selected.childBetas()
    sparse <- Matrix(0, nrow=nrow(cb), ncol=ncol(cb), sparse=TRUE)
    mask <- (cb > beta.threshold)
    sparse[mask] <- cb[mask]

    if (nrow(sparse) > beta.svd.dim * beta.svd.ratio) {
      singular <- ssvd(sparse, k=min(nrow(sparse)-1, beta.svd.dim))$u
    } else {
      singular <- rsvd(sparse, k=min(nrow(sparse)-1, beta.svd.dim))$u
    }

    newFit <- kmeans(singular, isolate(input$runtime.numClusters))

    childIDs <- selected.children()

    # NOTE(tfs): Theoretically, we don't need to update the selected topic at all (same leaf set)
    #            Or really the children either?
    changedIDs <- c()

    maxOldID <- max.id()

    newIDs <- c()

    # We always add all children to new clusters, so all old children of selected topic can be removed
    stateStore$child.map[[toString(selectedTopic)]] <- c()

    # Add new clusters into assignments and child.map of selected topic
    for (i in seq(numNewClusters)) {
      stateStore$child.map[[toString(selectedTopic)]] <- append(stateStore$child.map[[toString(selectedTopic)]], i + maxOldID)
      stateStore$child.map[[toString(i + maxOldID)]] <- c() # Initialize empty child.map for new cluster
      stateStore$assigns[[i + maxOldID]] <- selectedTopic
      newIDs <- append(newIDs, i + maxOldID)
    }

    # Update assignments to reflect new clustering
    for (i in seq(length(childIDs))) {
      ch <- childIDs[[i]]
      pa <- newFit$cluster[[i]] + maxOldID
      
      stateStore$assigns[[ch]] <- pa
      stateStore$child.map[[toString(pa)]] <- append(stateStore$child.map[[toString(pa)]], ch)
    }

    # Save the leaf maps of all new clusters
    for (i in newIDs) {
      cluster.leaves <- c()

      for (ch in stateStore$child.map[[toString(i)]]) {
        cluster.leaves <- append(cluster.leaves, stateStore$leaf.map[[toString(ch)]])
      }

      stateStore$leaf.map[[toString(i)]] <- cluster.leaves
    }

    # Relies on child.map, leaf.map, and assigns being already updated
    update.aggregate.state(changedIDs, newIDs)

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

    childIDs <- stateStore$child.map[[toString(topic)]]

    p <- stateStore$assigns[[topic]]

    if (length(childIDs) > 0) {
      for (ch in childIDs) {
        stateStore$assigns[[ch]] = p
        stateStore$child.map[[toString(p)]] <- append(stateStore$child.map[[toString(p)]], ch)
      }
    }

    stateStore$assigns[[topic]] <- NA
    stateStore$child.map[[toString(p)]] <- stateStore$child.map[[toString(p)]][stateStore$child.map[[toString(p)]] != topic]

    # Empty childmap and leafmap of deleted node
    stateStore$child.map[[toString(topic)]] <- c()
    stateStore$leaf.map[[toString(topic)]] <- c()

    session$sendCustomMessage("nodeDeletionComplete", "SUCCESS")
  })


  # Display title for currently active (e.g. hovered) topic
  #         Document tab displays contents for any hovered OR selected topic.
  topic.doctab.title <- reactive({
    if (input$topic.active == "") {
      return("Please Hover Over or Select a Topic")
    }

    topic <- as.integer(input$topic.active)

    if (topic == 0) { return("[ROOT]") }

    return(sanitize(stateStore$display.titles[topic], type="html"))
  })


  # Display title for currently selected (e.g. hovered) topic.
  #         Topic tab does not display anything if no topic is selected.
  topic.topictab.title <- reactive({
    if (input$topic.selected == "") {
      return("Please Select a topic")
    }

    topic <- as.integer(input$topic.selected)

    if (topic == 0) { return("[ROOT]") }

    return(sanitize(stateStore$display.titles[topic], type="html"))
  })


  topic.vocabtab.title <- reactive({
    if (input$topic.active == "") {
      return ("Please select a topic")
    }

    topic <- as.integer(input$topic.active)

    if (topic == 0) { return("[ROOT]") }

    return(sanitize(stateStore$display.titles[topic], type="html"))
  })


  # TODO(tfs; 2018-08-13): Switch to a more fine-grained approach to updating beta and theta here.
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

    if (source.id == 0) { return() } # We won't move the root

    # Leaf checks currently rely on all initial topics (leaves) to have IDs 1-K()
    source.is.leaf <- (source.id <= K() && K() > 0)
    target.is.leaf <- (target.id <= K() && target.id > 0)

    # Leaves (original topics) remain leaves
    if (target.is.leaf) { return() }

    if (source.id == target.id) { return() }

    empty.id <- source.id

    originP <- stateStore$assigns[[source.id]]
    origin.leaves <- stateStore$leaf.map[[toString(source.id)]]

    changedIDs <- c()
    if (source.id > 0) { changedIDs <- append(changedIDs, source.id) }
    if (target.id > 0) { changedIDs <- append(changedIDs, target.id) }

    # Add all ancestors of the original origin parent to changedIDs
    if (source.id > 0) {
      itr <- originP
      if (!itr %in% changedIDs) {
        changedIDs <- append(changedIDs, itr)
      }

      while(itr > 0) {
        itr <- stateStore$assigns[[itr]]
        if (!itr %in% changedIDs) {
          changedIDs <- append(changedIDs, itr)
        }
      }
    }

    # Add all ancestors of the target to changedIDs
    if (target.id > 0) {
      itr <- stateStore$assigns[[target.id]]
      if (!(itr %in% changedIDs)) {
        changedIDs <- append(changedIDs, itr)
      }

      while(itr > 0) {
        itr <- stateStore$assigns[[itr]]
        if (!(itr %in% changedIDs)) {
          changedIDs <- append(changedIDs, itr)
        }
      }
    }

    newIDs <- c()

    # TODO(tfs; 2018-08-13): Transition to functions for updating child map
    if (shift.held) {
      if (source.is.leaf || stateStore$assigns[[source.id]] == target.id) {
        # NOTE(tfs; 2018-08-16): This case seems to take particularly long, when it really shouldn't.

        # Shift is held, source is leaf or source is child of target
        #   Generates new node
        empty.id <- originP

        newID <- max.id() + 1

        # Add leafmap for new id (this is the only place we add an ID)
        stateStore$leaf.map[[toString(newID)]] <- c(origin.leaves)

        # Remove source from original parent in childmap
        stateStore$child.map[[toString(stateStore$assigns[[source.id]])]] <- stateStore$child.map[[toString(stateStore$assigns[[source.id]])]][stateStore$child.map[[toString(stateStore$assigns[[source.id]])]] != source.id]

        # Update assignments and child maps
        stateStore$assigns[[newID]] <- target.id
        stateStore$child.map[[toString(newID)]] <- c(source.id)
        stateStore$child.map[[toString(target.id)]] <- append(stateStore$child.map[[toString(target.id)]], newID)
        stateStore$assigns[[source.id]] <- newID
        newIDs <- append(newIDs, newID)
      } else {
        if (originP == target.id) { return() }

        # Shift is held, source is an aggregate node
        empty.id <- stateStore$assigns[[source.id]]

        # Remove source from original parent in childmap
        stateStore$child.map[[toString(stateStore$assigns[[source.id]])]] <- stateStore$child.map[[toString(stateStore$assigns[[source.id]])]][stateStore$child.map[[toString(stateStore$assigns[[source.id]])]] != source.id]

        stateStore$assigns[[source.id]] <- target.id

        # Add source to new parent's childmap
        stateStore$child.map[[toString(target.id)]] <- append(stateStore$child.map[[toString(target.id)]], source.id)
      }
    } else {
      if (originP == target.id) {
        return()
      }

      if (source.is.leaf) {
        empty.id <- stateStore$assigns[[source.id]]

        # Remove source from original parent in childmap
        # NOTE(tfs): I think this is the place something isn't being reset properly
        pstr <- toString(stateStore$assigns[[source.id]])
        stateStore$child.map[[pstr]] <- stateStore$child.map[[pstr]][stateStore$child.map[[pstr]] != source.id]

        # Move a single leaf node
        stateStore$assigns[[source.id]] <- target.id

        # Add source to new parent's childmap
        stateStore$child.map[[toString(target.id)]] <- append(stateStore$child.map[[toString(target.id)]], source.id)
      } else {
        # NOTE(tfs): This case is definitely broken
        # Move all children of the source node
        for (ch in stateStore$child.map[[toString(source.id)]]) {
          stateStore$assigns[[ch]] <- target.id
          stateStore$child.map[[toString(target.id)]] <- append(stateStore$child.map[[toString(target.id)]], ch)
        }

        # Empty source node's childmap and leafmap (by definition, this action deletes the node)
        stateStore$child.map[[toString(source.id)]] <- c()
        stateStore$leaf.map[[toString(source.id)]] <- c()

        empty.id <- source.id
      }
    }

    pitr <- originP

    # Remove leaves from origin's ancestors
    while (pitr > 0) {
      stateStore$leaf.map[[toString(pitr)]] <- stateStore$leaf.map[[toString(pitr)]][!(stateStore$leaf.map[[toString(pitr)]] %in% origin.leaves)]
      pitr <- stateStore$assigns[[pitr]]
    }

    # Append to target and ancestors
    if (target.id > 0) {
      stateStore$leaf.map[[toString(target.id)]] <- append(stateStore$leaf.map[[toString(target.id)]], origin.leaves)
      p <- stateStore$assigns[[target.id]]

      while (p > 0) {
        stateStore$leaf.map[[toString(p)]] <- append(stateStore$leaf.map[[toString(p)]], origin.leaves)
        p <- stateStore$assigns[[p]]
      }
    }

    ids.to.clean <- c()

    # Clean up if the update emptied a node
    while(empty.id > 0 && (is.null(stateStore$leaf.map[[toString(empty.id)]]) || length(stateStore$leaf.map[[toString(empty.id)]]) <= 0)) {
      nid <- stateStore$assigns[[empty.id]]
      ids.to.clean <- append(ids.to.clean, empty.id)
      pstr <- toString(stateStore$assigns[[empty.id]])
      stateStore$child.map[[pstr]] <- stateStore$child.map[[pstr]][stateStore$child.map[[pstr]] != empty.id]
      stateStore$assigns[[empty.id]] <- NA
      empty.id <- nid
    }

    changedIDs <- changedIDs[!duplicated(changedIDs)]
    changedIDs <- changedIDs[!changedIDs %in% ids.to.clean]
    changedIDs <- changedIDs[!changedIDs %in% newIDs]

    clean.aggregate.state(ids.to.clean)
    update.aggregate.state(changedIDs, newIDs)
  })


  # Handle changes to assignments from the frontend.
  #     To maintain ground truth, update stateStore on the backend.
  #     This ensures that data is consistent between widgets, as all output data is based solely
  #      on the backend's ground truth `stateStore`
  # Provided as a string encoding (same format as `assignString()`)
  observeEvent(input$topics, {
    if (is.null(input$topics) || input$topics == "" || input$topics == assignString()) { return() }
    
    newA <- c()     # Set up new assignments vector
    newCM <- list() # Set up new childmap

    newCM[[toString(0)]] <- c()

    for (ch in seq(nrow(beta))) {
      newA[[ch]] <- 0 # Will be overwritten, but ensures that at least all assignments to 0 are made
      newCM[[toString(ch)]] <- c()
    }

    for (pair in strsplit(aString, ",")[[1]]) {
      rel <- strsplit(pair, ":")[[1]] # Relation between two nodes

      ch <- as.integer(rel[[1]])
      p <- as.integer(rel[[2]])

      newA[[ch]] <- p

      if (!(ch %in% newCM[[toString(p)]])) {
        newCM[[toString(p)]] <- append(newCM[[toString(p)]], ch)
      }
    }

    for (i in seq(max(nrow(beta), max(newA[!is.na(newA)])))) {
      if (newA[[i]] == 0) {
        newCM[[toString(0)]] <- append(newCM[[toString(0)]], i)
      }
    }

    # Create new leafmap
    newLM <- list()

    for (i in seq(max(nrow(beta), max(newA[!is.na(newA)])))) {
      newLM[[toString(i)]] <- c()
    }

    # Build up leaf map, using new assignments
    for (i in seq(K())) {
      p <- newA[[i]]

      while(p > 0) {
        newLM[[toString(p)]] <- append(newLM[[toString(p)]], i)
        p <- newA[[p]]
      }
    }

    stateStore$leaf.map <- newLM
    stateStore$child.map <- newCM
    stateStore$assigns <- newA

    update.all.aggregate.state()
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
      stateStore$flat.selection <- NULL
      return()
    }

    # Error case. Shouldn't happen.
    if (length(stateStore$assigns) < nodeID) {
      stateStore$flat.selection <- NULL
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
    idlist <- idlist[!duplicated(idlist)]

    for (id in idlist) {
      stateStore$flat.selection[[id]] <- FALSE
    }
  })


  # Clears selection, used when exiting flat export more
  observeEvent(input$clear.flat.selection, {
    stateStore$flat.selection <- NULL
  })


  # TODO(tfs; 2018-08-13): Add to stateStore
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
    parentNode <- as.integer(input$topic.selected)
    if (is.na(parentNode) || parentNode == 0) {
      return(stateStore$child.map[[toString(0)]])
    } else {
      return(stateStore$child.map[[toString(parentNode)]])
    }
  })


  # Beta values for all children of selected topic
  selected.childBetas <- reactive({
    childIDs <- selected.children()

    return(stateStore$all.beta[childIDs,])
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
    return(stateStore$top.documents.order[[topic]])
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


  # TODO(tfs): Phase this out in favor of dynamically displaying an increasing number
  #            of document titles on the left panel
  last.shown.docidx <- reactive({
    return(min(num.documents(), num.documents.shown))
  })


  # SORTED selected betas
  betas.selected.sorted <- reactive({
    topic <- as.integer(input$topic.active)

    if (is.na(topic)) { return(list()) }

    sorted <- stateStore$all.beta[topic,][order(stateStore$all.beta[topic,], decreasing=TRUE)]

    return(sorted)
  })


  # Returns the SORTED theta values of all documents corresponding to the selected topic
  thetas.selected.sorted <- reactive({
    topic.theta <- data()$theta
    topic <- as.integer(input$topic.active)

    if (is.na(topic)) {
      return(list())
    }

    sorted <- stateStore$all.theta[,topic][order(stateStore$all.theta[,topic], decreasing=TRUE)]

    return(sorted)
  })


  # Top document titles for selected topic, formatted into HTML elements
  documents <- reactive({
    topic <- as.integer(input$topic.active)

    if (is.na(topic) || topic == 0) {
      return("")
    }

    # TODO(tfs; 2018-08-13): Rework for dynamic loading
    docs <- data()$doc.titles[stateStore$top.documents.order[[topic]][1:last.shown.docidx()]]

    thetas <- thetas.selected.sorted() # Used to show relevance to topic
    rv <- ""

    for (i in 1:length(docs)) {
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

    # TODO(tfs; 2018-08-03): Rework for dynamic loading
    terms <- data()$vocab[stateStore$top.vocab.order[[topic]][1:last.shown.docidx()]]

    betas <- betas.selected.sorted()
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
    update.display.titles(c(topic), c())

    session$sendCustomMessage("cleanTitleInput", "")
  })


  # Aggregate and format data necessary for the bubble/tree widgets, in parallel lists:
  #       parentID:    list of parent ids
  #         nodeID:    list of child ids
  #         weight:    list of node weights
  #          title:    list of node titles
  #      collapsed:    list of flags denoting collapsed nodes
  #         ilLeaf:    list of flags denoting whether node is a leaf
  #   flatSelected:    list of flags denoting nodes selected for flat export
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

    n <- max.id()

    cols <- c(colSums(data()$theta)) # Weights for each node, based on representation in the corpus

    for (ch in seq(n)) {
      # TODO(tfs; 2018-08-13): Move to stateStore
      if (is.collapsed.descendant()[[ch]]) { next } # Skip descendants of collapsed nodes
      if (is.na(stateStore$assigns[[ch]])) { next } # Continue
      nid <- append(nid, ch)
      pid <- append(pid, stateStore$assigns[ch])
      ttl <- append(ttl, stateStore$display.titles[[ch]])

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

        # TODO(tfs; 2018-08-13): Move to stateStore (is.collapsed.descendant)?
        if (is.na(stateStore$assigns[[ind]]) || is.collapsed.descendant()[[ind]]) { next }

        if (ind <= length(stateStore$collapsed.nodes) && !is.null(stateStore$collapsed.nodes[[ind]]) && !is.na(stateStore$collapsed.nodes[[ind]]) && stateStore$collapsed.nodes[[ind]]) {
          # Aggregate weight on backend for collapsed nodes
          newWgt <- 0

          for (l in stateStore$leaf.map[[toString(i + K())]]) {
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





