library(shiny)
library(shinyjs)

#library(htmlwidgets)
#library(devtools)
#devtools::install("/Users/ajbc/Projects/Academic/topic-bubbles/src/htmlwidget")
library(topicBubbles)

fluidPage(
  includeCSS("www/styling.css"),
  useShinyjs(),
  sidebarLayout(
    sidebarPanel(width=3,
      titlePanel("Topic Aggregation"),
      fileInput('topic.file', 'Topic Model (.RData)',
                  placeholder = "",
                  buttonLabel = "Select"#,
                  #accept=c('.RData')
      ),
      numericInput('num.clusters', "Number of clusters", value=10),
      downloadButton('download', 'Download'),
      hidden(div(id="summaryPanel",
                 hr(),
                 h3("Topic Summary"),
                 textInput('activeTopicTitle', ""),
                 htmlOutput('topic.docs', class="docs")))
    ),
    mainPanel(
      topicBubblesOutput("bubbles", height=800),
      textInput("topics", ""),
      textInput("active", "")
    )
  )
)
