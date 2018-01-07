library(shiny)
library(shinyjs)
library(jsonlite)
library(stm)
library(data.table)
library(htmlwidgets)
library(topicBubbles)

options(shiny.maxRequestSize=1e4*1024^2)

function(input, output, session) {
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

  # FOR REFERENCE
  # observe({
  #     shinyjs::toggleState("submit", !is.null(input$name) && input$name != "")
  #   })

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
    # data <- reactive({
    #   inFile <- input$topic.file
    #   if (is.null(inFile))
    #     return(NULL)

    #   load(inFile$datapath)

    #   return(list("model"=model, "out"=out, "processed"=processed, "doc.summaries"=doc.summaries))
    # })

    # session$sendCustomMessage(type="initialized", "Howdy?")
    # dataJSON <- toJSON(data())
    # session$sendCustomMessage("parsed", "JSONIFIED")
    # session$sendCustomMessage(type = "startInit", "Parsing File")
    # session$sendCustomMessage(type = "initData", data())
    # session$sendCustomMessage(type="processingFile", "")
    req(data())
    req(bubbles.data())
    shinyjs::hide(selector=".initial")
    shinyjs::show(selector=".left-content")
    shinyjs::show(selector=".main-content")
  })


  observeEvent(input$enterExportMode, {
    session$sendCustomMessage("enterExportMode", "")
  })


  observeEvent(input$exitExportMode, {
    session$sendCustomMessage("exitExportMode", "")  
  })


  # output$downloadSVG = downloadHandler(
  #   filename = function () { paste(paste(chosenDataName(), input$selectedView, sep="_"), "svg", sep=".") },
  #   content = function (file) {
  #     outString <- input$svgString
  #     write(out, file=file, row.names=FALSE, quote=FALSE)
  #   }
  # )


  beta <- reactive({
    if (is.null(data()))
      return(NULL)

    return(exp(data()$model$beta$logbeta[[1]]))
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

  observeEvent(input$runtimeCluster, {
    req(data())

    # TODO(tfs): This is the rough structure I want, but should use direct children only
    if (input$topic.selected == "") {
      newFit <- kmeans(beta(), isolate(input$runtime.numClusters))
    } else {
      newFit <- kmeans(beta(), isolate(input$runtime.numClusters))
    }

    session$sendCustomMessage(type = "runtimeCluster", msg)
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

  topic.title <- reactive({
    if (input$topic.selected == "")
      return("None Selected")

    topic <- as.integer(input$topic.selected)
    if (topic <= K())
      return(titles()[topic])
    return(cluster.titles()[topic-K()])
  })

  # TODO(tfs): New structure proposal, to help with reclustering:
  #            kmeans fits on backend send messages to frontend,
  #            restructure the nodes and update a string on frontend,
  #            linked as an input field. assignments then essentially
  #            just reflects this input field.
  # TODO(tfs): This will need to be updated for reclustering
  assignments <- reactive({
    if (is.null(data())) {
      return(c())
    }

    fit <- initial.kmeansFit()

    # if (input$topics == "") {
    #   return(c(fit$cluster + K(), rep(0, input$initial.numClusters)))
    # }

    # NOTE(tfs): SHOULD only occur on initialization
    if (input$topics == "") {
      if (input$initialize.kmeans) {
        return(c(fit$cluster + K(), rep(0, input$initial.numClusters)))
      } else {
        return(c(rep(0, K())))
      }
    }

    node.ids <- c()
    parent.ids <- c()
    for (pair in strsplit(input$topics, ',')[[1]]) {
      ids <- strsplit(pair, ":")[[1]]
      node.ids <- c(node.ids, as.integer(ids[[1]]))
      parent.ids <- c(parent.ids, as.integer(ids[[2]]))
    }

    # adjust ids for missing/deleted clusters
    # TODO: consider a more elegant solution (see also download)
    for (i in seq(max(parent.ids))) {
      # if this id doesn't exist, add a dummy one
      if (sum(node.ids==i) == 0) {
        node.ids <- c(node.ids, i)
        parent.ids <- c(parent.ids, 0)
      }
    }

    ids <- parent.ids[order(node.ids)]

    # NOTE(tfs; 2017-10-12): If initial.numClusters was updated on the UI after
    #      nodes were manually assigned, input$topics will not be empty.
    #      However, the length of assignments in input$topics will
    #      correspond to the previous initial.numClusters, resulting in a
    #      crash unless we verify before returning here.
    if (length(ids) != (K() + input$initial.numClusters)) {
      return(c(fit$cluster + K(), rep(0, input$initial.numClusters)))
    }

    return(ids)
  })

  # Full storage of child IDs for each node (0 is root)
  children <- reactive({
    req(assignments())
    childmap <- list()

    # for (i in seq(length(assignments()))) {
    #   childmap[[i]] <- c()
    # }

    for (ch in seq(length(assignments()))) {
      p <- assignments()[ch]
      if (p == 0) {
        if ("root" %in% childmap) {
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
    if (is.na(parentNode)) {
      return(children()$root)
    } else {
      return(children()[[parentNode]])
    }
  })

  n.nodes <- reactive({
    if (is.null(data())) {
      return(0)
    }

    # NOTE(tfs): Restructured assignments(), will now be always list each node
    # if (input$topics == "")
    #   return(input$initial.numClusters)

    return(length(assignments()) - K())
  })

  output$topic.summary <- renderUI({
    # if (input$active == "")
    #   return()

    out.string <- paste("<hr/>\n<h3>Topic Summary</h3>\n",
                        "<h4>", topic.title(), "</h4>\n", documents())
    return(HTML(out.string))
  })

  leaf.ids <- reactive({
    req(assignments())
    leafmap <- list()

    # Leaf set = original K() topics
    for (ch in seq(K())) {
      itrID <- ch

      p <- assignments()[itrID]
      while (p > 0) {
        if (p <= length(leafmap) && !is.null(leafmap[[p]])) {
          leafmap[[p]] <- append(leafmap[[p]], ch)
        } else {
          leafmap[[p]] <- c(ch)
        }

        itrID <- p

        p <- assignments()[itrID]
      }
    }

    return(leafmap)
  })

  # TODO(tfs): This will need to be updated for hierarchical kmeans, I believe
  meta.theta <- reactive({
    theta <- data()$model$theta
    mtheta <- matrix(0, nrow=nrow(theta), ncol=n.nodes())
    
    if (n.nodes() <= 0) {
      return(mtheta)
    }

    # for (topic in seq(K())) {
    #   # rv[[topic]] <- data()$doc.summaries[order(theta[,topic], decreasing=TRUE)[1:10]]

    #   mtheta[,assignments()[topic] - K()] <-
    #     mtheta[,assignments()[topic] - K()] + theta[,topic]
    # }

    for (clusterID in seq(K()+1, length(assignments()))) {
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
      rv[[topic]] <- data()$doc.summaries[order(theta[,topic], decreasing=TRUE)[1:10]]

      # meta.theta[,assignments()[topic] - K()] <-
      #   meta.theta[,assignments()[topic] - K()] + theta[,topic]
    }

    if (n.nodes() > 0) {
      for (meta.topic in seq(length(assignments()) - K())) {
        rv[[meta.topic + K()]] <- data()$doc.summaries[order(meta.theta()[,meta.topic],
                                                  decreasing=TRUE)[1:10]]
      }
    }

    return(rv)
  })

  thetas.selected <- reactive({
    topic.theta <- data()$model$theta
    topic <- as.integer(input$topic.selected)

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
    topic <- as.integer(input$topic.selected)

    if (is.na(topic)) {
      return("")
    }

    docs <- top.documents()[[topic]]
    thetas <- thetas.selected()
    rv <- ""
    # for (doc in top.documents()[[topic]]) {
    for (i in 1:length(top.documents()[[topic]])) {
      rv <- paste(rv, "<div class=\"document-summary\">",
                  "<div class=\"document-summary-fill\" style=\"width:",
                  paste(as.integer(thetas[i] * 100), "%;", sep=""),
                  "\"></div>",
                  "<p class=\"document-summary-contents\">",
                  substr(docs[i], start=1, stop=95),
                  "...</p>",
                  "</div>")
    }
    return(rv)
  })

  output$topic.documents <- renderUI({
    # req(input$topic.selected)
    rv <- paste("<h4 id=\"left-document-tab-cluster-title\">",
                topic.title(),
                "</h4>",
                "<div class=\"topic-bar document-container\">",
                documents(),
                "</div>")

    return(HTML(rv))
  })

  # TODO: this may not work for deeper hierarchy; needs to be checked once implemented
  cluster.titles <- reactive({
    if (is.null(data())) {
      return(c())
    }

    if (n.nodes() <= 0) {
      return(c())
    }

    marginals <- matrix(0, nrow=n.nodes(), ncol=ncol(beta()))
    weights <- colSums(data()$model$theta)
    for (node in seq(length(assignments()), 1)) {
      val <- 0
      if (assignments()[node] == 0)
        val <- 0
      else if (node <= K())
        val <- beta()[node,] * weights[node]
      else
        val <- marginals[node - K(),]
      marginals[assignments()[node]-K(),] <- marginals[assignments()[node]-K(),] + val
    }

    rv <- c()
    for (cluster in seq(n.nodes())) {
      title <- paste(data()$out$vocab[order(marginals[cluster,],
                                            decreasing=TRUE)][seq(5)], collapse=" ")

      rv <- c(rv, title)

      title <- paste(data()$out$vocab[order(marginals[cluster,],
                                            decreasing=TRUE)][seq(20)], collapse=" ")
      vals <- marginals[cluster, order(marginals[cluster,], decreasing=TRUE)[seq(20)]]
    }

    return(rv)

    #TODO: add on reset
    #document.getElementById("topics").value = "";
    #write assignemnts to topics text file
  })

  bubbles.data <- reactive({
    if (is.null(data())) {
      return(NULL)
    }

    # # parent.id, topic.id, weight, title
    # rv1 <- data.frame(parentID=c(rep(0, input$initial.numClusters), initial.kmeansFit()$cluster + K()),
    #                  nodeID=c(seq(K()+1,K()+input$initial.numClusters), seq(K())),
    #                  weight=c(rep(0, input$initial.numClusters), colSums(data()$model$theta)),
    #                  title=c(isolate(cluster.titles()), titles()))

    # rv <- data.frame(parentID=pid, nodeID=nid, weight=wgt, title=ttl)
    pid <- c()
    nid <- c()

    if (length(assignments()) > K()) {
      for (ch in seq(K()+1,length(assignments()))) {
        p <- assignments()[ch]
        pid <- append(pid, p)
        nid <- append(nid, ch)
      }
    }

    for (ch in seq(K())) {
      p <- assignments()[ch]
      pid <- append(pid, p)
      nid <- append(nid, ch)
    }

    wgt <- c(rep(0, length(assignments()) - K()), colSums(data()$model$theta))
    ttl <- c(isolate(cluster.titles()), titles())

    rv <- data.frame(parentID=pid, nodeID=nid, weight=wgt, title=ttl)
    return(rv)
  })

  output$bubbles <- renderTopicBubbles({ topicBubbles(bubbles.data()) })
}

# function(input, output, session) {

#   data <- reactive({
#     inFile <- input$topic.file
#     if (is.null(inFile))
#       return(NULL)

#     load(inFile$datapath)

#     return(list("model"=model, "out"=out, "processed"=processed, "doc.summaries"=doc.summaries))
#   })

#   beta <- reactive({
#     if (is.null(data()))
#       return(NULL)
#     return(exp(data()$model$beta$logbeta[[1]]))
#   })

#   kmeans.fit <- reactive({
#     if (is.null(beta()))
#       return(NULL)
#     return(kmeans(beta(), input$num.clusters))
#   })

#   K <- reactive({
#     if (is.null(data()))
#       return(0)
#     return(nrow(beta()))
#   })

#   titles <- reactive({
#     rv <- c()
#     if (is.null(data()))
#       return(rv)

#     for (k in seq(K())) {
#       title <- paste(data()$out$vocab[order(beta()[k,], decreasing=TRUE)][seq(5)], collapse=" ")
#       rv <- c(rv, title)
#     }

#     return(rv)
#   })

#   assignments <- reactive({
#     if (is.null(data()))
#       return(c())

#     fit <- kmeans.fit()

#     if (input$topics == "") {
#       return(c(fit$cluster + K(), rep(0, input$num.clusters)))
#     }

#     node.ids <- c()
#     parent.ids <- c()
#     for (pair in strsplit(input$topics, ',')[[1]]) {
#       ids <- strsplit(pair, ":")[[1]]
#       node.ids <- c(node.ids, as.integer(ids[[1]]))
#       parent.ids <- c(parent.ids, as.integer(ids[[2]]))
#     }

#     # adjust ids for missing/deleted clusters
#     # TODO: consider a more elegant solution (see also download)
#     for (i in seq(max(parent.ids))) {
#       # if this id doesn't exist, add a dummy one
#       if (sum(node.ids==i) == 0) {
#         node.ids <- c(node.ids, i)
#         parent.ids <- c(parent.ids, 0)
#       }
#     }

#     ids <- parent.ids[order(node.ids)]

#     # NOTE(tfs; 2017-10-12): If num.clusters was updated on the UI after
#     #      nodes were manually assigned, input$topics will not be empty.
#     #      However, the length of assignments in input$topics will
#     #      correspond to the previous num.clusters, resulting in a
#     #      crash unless we verify before returning here.
#     if (length(ids) != (K() + input$num.clusters)) {
#       return(c(fit$cluster + K(), rep(0, input$num.clusters)))
#     }

#     return(ids)
#   })

#   n.nodes <- reactive({
#     if (is.null(data()))
#       return(0)

#     if (input$topics == "")
#       return(input$num.clusters)

#     return(length(assignments())-K())
#   })

#   # TODO: this may not work for deeper hierarchy; needs to be checked once implemented
#   cluster.titles <- reactive({
#     if (is.null(data()))
#       return(c())

#     marginals <- matrix(0, nrow=n.nodes(), ncol=ncol(beta()))
#     weights <- colSums(data()$model$theta)
#     for (node in seq(length(assignments()), 1)) {
#       val <- 0
#       if (assignments()[node] == 0)
#         val <- 0
#       else if (node <= K())
#         val <- beta()[node,] * weights[node]
#       else
#         val <- marginals[node - K(),]
#       marginals[assignments()[node]-K(),] <- marginals[assignments()[node]-K(),] + val
#     }

#     rv <- c()
#     for (cluster in seq(n.nodes())) {
#       title <- paste(data()$out$vocab[order(marginals[cluster,],
#                                             decreasing=TRUE)][seq(5)], collapse=" ")

#       rv <- c(rv, title)

#       title <- paste(data()$out$vocab[order(marginals[cluster,],
#                                             decreasing=TRUE)][seq(20)], collapse=" ")
#       vals <- marginals[cluster, order(marginals[cluster,], decreasing=TRUE)[seq(20)]]
#     }

#     return(rv)

#     #TODO: add on reset
#     #document.getElementById("topics").value = "";
#     #write assignemnts to topics text file
#   })

#   observeEvent(input$topics, {
#     if (is.null(data()))
#       return(NULL)

#     session$sendCustomMessage(type = "topics", cluster.titles())
#   })

#   bubbles.data <- reactive({
#     if (is.null(data()))
#       return(NULL)

#     #parent.id, topic.id, weight, title
#     rv <- data.frame(parentID=c(rep(0, input$num.clusters), kmeans.fit()$cluster + K()),
#                      nodeID=c(seq(K()+1,K()+input$num.clusters), seq(K())),
#                      weight=c(rep(0, input$num.clusters), colSums(data()$model$theta)),
#                      title=c(isolate(cluster.titles()), titles()))

#     return(rv)
#   })

#   output$bubbles <- renderTopicBubbles({ topicBubbles(bubbles.data(), height=800) })

#   top.documents <- reactive({
#     # TODO: this will need to be updated for hierarchy
#     rv <- list()
#     theta <- data()$model$theta
#     meta.theta <- matrix(0, nrow=nrow(theta), ncol=length(assignments()) - K())
#     for (topic in seq(K())) {
#       rv[[topic]] <- data()$doc.summaries[order(theta[,topic], decreasing=TRUE)[1:10]]

#       meta.theta[,assignments()[topic] - K()] <-
#         meta.theta[,assignments()[topic] - K()] + theta[,topic]
#     }

#     for (meta.topic in seq(length(assignments()) - K())) {
#       rv[[meta.topic + K()]] <- data()$doc.summaries[order(meta.theta[,meta.topic],
#                                                 decreasing=TRUE)[1:10]]
#     }

#     return(rv)
#   })

#   documents <- reactive({
#     topic <- as.integer(input$active)
#     rv <- ""
#     for (doc in top.documents()[[topic]]) {
#       rv <- paste(rv, "<p>",
#                   substr(doc, start=1, stop=100),
#                   "...</p>")
#     }
#     return(rv)
#   })

#   topic.title <- reactive({
#     if (input$active == "")
#       return()

#     topic <- as.integer(input$active)
#     if (topic <= K())
#       return(titles()[topic])
#     return(cluster.titles()[topic-K()])
#   })

#   output$topic.summary <- renderUI({
#     if (input$active == "")
#       return()

#     out.string <- paste("<hr/>\n<h3>Topic Summary</h3>\n",
#                         "<h4>", topic.title(), "</h4>\n", documents())
#     return(HTML(out.string))
#   })

#   output$download <- downloadHandler(
#     filename = "topics.csv",
#     content = function(file) {

#       out <- data.frame(topic.id=seq(length(assignments())), parent.id=assignments(),
#                         title=c(titles(), cluster.titles()))

#       # get rid of empty nodes
#       for (id in rev(out[out$parent.id == 0,]$topic.id)) {
#         if (nrow(out[out$parent.id == id,]) == 0) {
#           out[out$parent.id > id,]$parent.id <- out[out$parent.id > id,]$parent.id - 1
#           out[out$topic.id > id,]$topic.id <- out[out$topic.id > id,]$topic.id - 1
#           out <- out[-id,]
#         }
#       }

#       write.csv(out, file, row.names = FALSE, quote=FALSE)
#     }
#   )
# }
