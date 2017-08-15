library(shiny)
library(shinyjs)

#library(htmlwidgets)
#library(devtools)
#devtools::install("/Users/ajbc/Projects/Academic/topic-bubbles/src/htmlwidget") 
library(topicBubbles)

#https://cran.r-project.org/web/packages/shinyjs/vignettes/shinyjs-extend.html
#jsCode <- "shinyjs.pageCol = function(params){$('body').css('background', params);}"
#jsCode <- readChar("www/bubbles.js", file.info("www/bubbles.js")$size)
#print(jsCode)

# https://gist.github.com/4979/e9f8e9ddb70673e76c29
#d3IO <- function(inputoutputID) {
#  div(id=inputoutputID,class=inputoutputID,tag("svg",""));
#}

fluidPage(
  #tags$head(tags$link(rel = "stylesheet", type = "text/css", href = "styling.css")),
  includeCSS("www/styling.css"),
  #tags$script(src="https://d3js.org/d3.v3.min.js"),
  #tags$script(src="bubbles.js"),
  #useShinyjs(),
  #extendShinyjs(script="www/bubbles.js"),
  sidebarLayout(
    sidebarPanel(width=3,
      titlePanel("Topic Aggregation"),
      fileInput('topic.file', 'Topic Model (.RData)',
                  placeholder = "",
                  buttonLabel = "Select"#,
                  #accept=c('.RData')
      ),
      numericInput('num.clusters', "Number of clusters", value=10)
      # tags$hr(),
      # checkboxInput('header', 'Header', TRUE),
      # radioButtons('sep', 'Separator',
      #              c(Comma=',',
      #                Semicolon=';',
      #                Tab='\t'),
      #              ','),
      # radioButtons('quote', 'Quote',
      #              c(None='',
      #                'Double Quote'='"',
      #                'Single Quote'="'"),
      #              '"')
    ),
    mainPanel(
      topicBubblesOutput("bubbles", height=800),
      textInput("topics", "")
    )
  )
)