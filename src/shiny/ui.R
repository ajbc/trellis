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
      p("Data: Blog posts from 6 blogs during the U.S. 2008 Presidential Election", a("(see here)", href="https://www.rdocumentation.org/packages/stm/versions/1.1.3/topics/poliblog5k")),
      numericInput('num.clusters', "Number of clusters", value=10),
      downloadButton('download', 'Download'),
      actionButton('instructions', 'Use'),
      actionButton('feedback', 'Suscribe', onclick ="window.open('https://goo.gl/forms/HP7aTlMyMdKChaGi2', '_blank')"),
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
