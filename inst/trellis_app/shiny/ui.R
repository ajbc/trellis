library(shiny)
library(shinyjs)
library(htmlwidgets)
library(topicBubbles)
library(topicTree)
library(shinyFiles)

htmlTemplate("template.html",
    outputTitleName = titlePanel("Upload Dataset"),

    # NOTE(tfs): Names with "." in them appear to break shinyFiles
    inputFileUpload = shinyFilesButton("modelfile", 'Topic Model',
                      'Topic model or saved work (.RData)',
                      FALSE),
    inputFileLocation = shinyDirButton("textlocation", 'Text Files',
                        'Folder containing original text files (optional)'),
   
    inputDataName = textInput("topic.datasetName", "",
               placeholder="Name your dataset",
               width = "90%"),
    outputModelFileName = htmlOutput("modelfile.name"),
    outputTextDirName = htmlOutput("textdirectory.name"),
    inputInitialKmeans = checkboxInput("initialize.kmeans", "Initialize with KMeans",
                    value = TRUE, width="auto"),
    inputNumStartClusters = numericInput("initial.numClusters", "Number of clusters", value=10),
    inputStartButton = actionButton("topic.start", "Start"),
    outputDataName = textOutput("topic.chosenName"), # I want to know if there's a better way to organize this naming. More angular-like?
    inputEnterExportButton = actionButton("enterExportMode", "Export"),
    inputExitExportButton = actionButton("exitExportMode", "Cancel", class="btn-danger"),
    # inputSaveButton = downloadButton("download.data", "Save"),
    inputSaveButton = shinySaveButton("savedata", "Save", "Save file as . . . ", list('RData'=c(".RData"))),
    outputTopicSummaries = htmlOutput("topic.doctab.summary", class="summary"),
    outputDocumentTitle = htmlOutput("topic.document.title"),
    outputDocuments = htmlOutput("topic.documents", class="summary"),
    outputTopicTabTitle = htmlOutput("topicTabTitle"),
    outputVocabTitle = htmlOutput("topic.vocabtab.title"),
    outputVocab = htmlOutput("topic.vocab"),
    inputTitleUpdateText = textInput("topic.customTitle", "", placeholder="New topic title"),
    inputTitleUpdateButton = actionButton("updateTitle", "Update", class="btn btn-secondary"),
    inputNumNewClusters = numericInput("runtime.numClusters", "Number of clusters", value=10),
    inputClusterButton = actionButton("runtimeCluster", "Cluster"),
    inputDeleteCluster = actionButton("deleteCluster", "Delete"),
    outputBubbles = topicBubblesOutput("bubbles"),
    outputTree = topicTreeOutput("tree"),
    outputDocumentDetailsTitle = htmlOutput("document.details.title"),
    outputDocumentDetails = htmlOutput("document.details"),
    outputExportFlat = shinySaveButton("exportflat", "Export", "Save exported model as . . .", list('RData'=c(".RData")))
)
