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
    inputInitialKmeans = checkboxInput("initialize.kmeans", "Initialize with KMeans",
                    value = TRUE, width="auto"),
    inputNumStartClusters = numericInput("initial.numClusters", "Number of clusters", value=10),
    inputStartButton = actionButton("topic.start", "Start"),
    outputDataName = textOutput("topic.chosenName"), # I want to know if there's a better way to organize this naming. More angular-like?
    inputEnterExportButton = actionButton("enterExportMode", "Export"),
    inputExitExportButton = actionButton("exitExportMode", "Cancel", class="btn-danger"),
    inputSaveButton = downloadButton("download.data", "Save"),
    outputTopicSummaries = htmlOutput("topic.doctab.summary", class="summary"),
    outputDocuments = htmlOutput("topic.documents", class="summary"),
    outputTopicTabTitle = htmlOutput("topicTabTitle"),
    inputTitleUpdateText = textInput("topic.customTitle", "", width="70%", placeholder="New topic title"),
    inputTitleUpdateButton = actionButton("updateTitle", "Update", class="btn btn-secondary"),
    inputNumNewClusters = numericInput("runtime.numClusters", "Number of clusters", value=10),
    inputClusterButton = actionButton("runtimeCluster", "Cluster"),
    outputBubbles = topicBubblesOutput("bubbles")
)