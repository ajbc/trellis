library(shiny)
library(shinyjs)
library(stm)
library(data.table)
library(htmlwidgets)
library(topicBubbles)

options(shiny.maxRequestSize=1e4*1024^2)

function(input, output, session) {
  output$chosenName <- reactive(input$topic.datasetName)

  # FOR REFERENCE
  # observe({
  #     shinyjs::toggleState("submit", !is.null(input$name) && input$name != "")
  #   })

  isolate(input$topic.file) # Really not sure how best to isolate these yet? Probably not necessary as everything should hide anyway
  data <- reactive({
    inFile <- input$topic.file
    if (is.null(inFile))
      return(NULL)

    load(inFile$datapath)

    return(list("model"=model, "out"=out, "processed"=processed, "doc.summaries"=doc.summaries))
  })

  observeEvent(input$topic.start, {
    # data <- reactive({
    #   inFile <- input$topic.file
    #   if (is.null(inFile))
    #     return(NULL)

    #   load(inFile$datapath)

    #   return(list("model"=model, "out"=out, "processed"=processed, "doc.summaries"=doc.summaries))
    # })
    shinyjs::logjs("test")
    shinyjs::hide(selector=".initial")
    shinyjs::show("left-content")
    shinyjs::show(selector="#main-content")
    # session$sendCustomMessage(type="initialized", "Howdy?")
  })
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
