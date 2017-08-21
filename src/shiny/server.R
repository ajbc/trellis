library(shiny)
library(shinyjs)
library(stm)
library(data.table)

options(shiny.maxRequestSize=1e4*1024^2)

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

  bubbles.data <- reactive({
    if (is.null(data()))
      return(NULL)
    
    #parent.id, topic.id, weight, title
    rv <- data.frame(parentID=0,
                     nodeID=seq(input$num.clusters),
                     weight=0,
                     title="")

    rv <- rbind(rv,
                data.frame(parentID=kmeans.fit()$cluster,
                           nodeID=seq(input$num.clusters+1,input$num.clusters+K()),
                           weight=colSums(data()$model$theta),
                           title=titles()))
    return(rv)
  })
  
  output$bubbles <- renderTopicBubbles({ topicBubbles(bubbles.data(), height=800) })
}