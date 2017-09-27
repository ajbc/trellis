library(shiny)
library(shinyjs)

#library(htmlwidgets)
#library(devtools)
#devtools::install("/Users/ajbc/Projects/Academic/topic-bubbles/src/htmlwidget")
library(htmlwidgets)
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
  useShinyjs(),
  sidebarLayout(
    sidebarPanel(width=3,
      titlePanel(a("Topic Aggregation", href="http://ajbc.io/topic-bubbles/")),
      p("Data: All press releases from U.S. Senators between 2005-2007", a("(see here)", href="https://dataverse.harvard.edu/dataset.xhtml?persistentId=hdl:1902.1/14596")),
      numericInput('num.clusters', "Number of clusters", value=10),
      downloadButton('download', 'Download'),
      htmlOutput('topic.summary', class="summary")
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
      textInput("topics", ""),
      textInput("active", "")
    )
  )
)
