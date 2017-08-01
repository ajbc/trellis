library(shiny)
library(shinyjs)

#https://cran.r-project.org/web/packages/shinyjs/vignettes/shinyjs-extend.html
#jsCode <- "shinyjs.pageCol = function(params){$('body').css('background', params);}"
#jsCode <- readChar("www/bubbles.js", file.info("www/bubbles.js")$size)
#print(jsCode)

# https://gist.github.com/4979/e9f8e9ddb70673e76c29
d3IO <- function(inputoutputID) {
  div(id=inputoutputID,class=inputoutputID,tag("svg",""));
}

fluidPage(
  #tags$head(tags$link(rel = "stylesheet", type = "text/css", href = "styling.css")),
  includeCSS("www/styling.css"),
  tags$script(src="https://d3js.org/d3.v3.min.js"),
  #tags$script(src="bubbles.js"),
  useShinyjs(),
  extendShinyjs(script="www/bubbles.js"),
  titlePanel("Topic Aggregation"),
  sidebarLayout(
    sidebarPanel(width=2,
      selectInput("upload", label="Select input",
                  choices=list("documents"=1, "saved topic model"=2)),
      conditionalPanel(
        "input.upload == 1",
        fileInput('csv.file', 'Data File (CSV format)',
                  placeholder = "",
                  buttonLabel = "Select",
                  accept=c('text/csv', 
                           'text/comma-separated-values,text/plain', 
                           '.csv')),
        numericInput('num.topics', "Number of topics", value=50)
      ),
      conditionalPanel(
        "input.upload == 2",
        fileInput('topic.file', 'Topic Model (.RData)',
                  placeholder = "",
                  buttonLabel = "Select",
                  accept=c('.RData', '.rds'))
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
      textOutput("status"),
      d3IO("d3io")
      #htmlOutput("d3")#,
      #tags$h1("Title"),
      #d3IO("d3io")
      #tags$div(id="AROO", class="shiny-html-output", svg(width="300", height="200"))
      #tags$div(id=d3, class="shiny-html-output", svg(width="300", height="200")
    )
  )
)