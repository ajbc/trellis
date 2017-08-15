library(shiny)
library(shinyjs)
library(stm)
library(data.table)

options(shiny.maxRequestSize=1000*1024^2)

function(input, output) {
  
  data <- reactive({
    inFile <- input$topic.file
    if (is.null(inFile))
      return(NULL)
    #return(data.frame())
    load(inFile$datapath)
    #cat("HI", "\n")
    return(list("model"=model, "out"=out, "processed"=processed))
  })
  
  beta <- reactive({
    if (is.null(data()))
      return(NULL)
    return(exp(data()$model$beta$logbeta[[1]]))
  })

  kmeans.fit <- reactive({
    if (is.null(beta()))
      return(NULL)
    return(kmeans(beta(), input$num.clusters))
  })

  K <- reactive({ 
    if (is.null(data()))
      return(0)
    return(nrow(beta()))
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
  
  assignments <- reactive({
    if (is.null(data()))
      return(c())
    
    if (input$topics == "")
      return(c(rep(0, input$num.clusters), kmeans.fit()$cluster + K()))
    
    return(as.integer(strsplit(input$topics, ",")[[1]]))
  })
  
  n.nodes <- reactive({
    if (is.null(data()))
      return(c())
    
    if (input$topics == "")
      return(input$num.clusters)
    
    return(length(assignments())-K())
  })
  
  cluster.titles <- reactive({
    if (is.null(data()))
      return(c())
    
    marginals <- matrix(0, nrow=n.nodes(), ncol=ncol(beta()))
    node.ids <- c(seq(K()+1,K()+n.nodes()), seq(K()))
    weights <- colSums(data()$model$theta)
    for (node in seq(length(assignments()), 1)) {
      val <- 0
      if (assignments()[node] == 0)
        val <- 0
      else if (node.ids[node] <= K())
        val <- beta()[node.ids[node],] * weights[node.ids[node]]
      else
        val <- marginals[node.ids[node]-K(),]
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
    if (is.null(data()))
      return(NULL)
    
    #parent.id, topic.id, weight, title
    rv <- data.frame(parentID=assignments(),
                     nodeID=c(seq(K()+1,K()+n.nodes()), seq(K())),
                     weight=c(rep(0, n.nodes()), colSums(data()$model$theta)),
                     title=c(cluster.titles(), titles()))
    
    return(rv)
  })
  
  output$bubbles <- renderTopicBubbles({ topicBubbles(bubbles.data(), height=800) })
}