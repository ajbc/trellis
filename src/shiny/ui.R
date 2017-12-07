library(shiny)
library(shinyjs)
library(htmlwidgets)
library(topicBubbles)

htmlTemplate("template.html",
    outputTitleName = titlePanel("Upload Dataset"),
    inputFileUpload = fileInput('topic.file', '',
                 placeholder = "Topic Model (.RData) or saved work (TBD)",
                 buttonLabel = "Select",
                 width = "90%"),
    inputDataName = textInput("topic.datasetName", "",
               placeholder="Name your dataset",
               width = "90%"),
    inputInitialKmeans = checkboxInput("topic.initialize", "Initialize with KMeans",
                    value = TRUE, width="auto"),
    inputNumClusters = numericInput('num.clusters', "Number of clusters", value=10),
    inputStartButton = actionButton("topic.start", "Start"),
    outputDataName = textOutput("topic.chosenName"), # I want to know if there's a better way to organize this naming. More angular-like?
    inputExportButton = actionButton("export", "Export"),
    inputSaveButton = downloadButton("download", "Save")
)