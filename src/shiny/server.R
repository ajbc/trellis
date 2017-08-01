library(shiny)
library(shinyjs)
library(stm)
library(data.table)

options(shiny.maxRequestSize=50*1024^2)

function(input, output) {
  
  data <- reactive({
    if (input$upload==2) {
      inFile <- input$topic.file
      if (is.null(inFile))
        return(NULL)
      
      load(inFile)
      return(list("model"=model, "out"=out, "processed"=processed))
    } else {
      inFile <- input$csv.file
      if (is.null(inFile))
        return(NULL)
      
      max.EM <- 10
      max.status <- max.EM + 4
      
      withProgress(message="Status:", value=0, {
        incProgress(1/max.status, detail = "reading in data")
        raw.data <- as.data.frame(fread(inFile$datapath))
        
        incProgress(2/max.status, detail = "processing data")
        processed <- textProcessor(raw.data$documents,
                                   metadata = raw.data)
        
        incProgress(3/max.status, detail = "processing data")
        out <- prepDocuments(processed$documents,
                             processed$vocab,
                             processed$meta)
        
        incProgress(4/max.status, detail = "running STM")
        
        model <- stm(documents=out$documents,
                     vocab=out$vocab,
                     K=input$num.topics, max.em.its=max.EM,
                     init.type="Spectral",
                     verbose=FALSE)
      })
      
      return(list("model"=model, "out"=out, "processed"=processed))
    }
  })
  
  kmeans.fit <- reactive({
    beta <- exp(data$model$beta$logbeta[[1]])
    return(kmeans(beta, input$num.clusters))
  })
  
  
  
  #output$status <- renderText({ model() })
  #output$d3 <- renderUI( { 
  #    tagList()})
  #  return('<svg width="960" height="960" font-family="sans-serif" font-size="10" text-anchor="middle"></svg>')
  #  })
}