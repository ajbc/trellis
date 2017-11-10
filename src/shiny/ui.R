htmlTemplate("template.html",
    titleName = titlePanel("Upload Dataset"),
    fileUpload = fileInput('topic.file', '',
                 placeholder = "Topic Model (.RData) or saved work (TBD)",
                 buttonLabel = "Select",
                 width = "90%"),
    dataName = textInput("topic.datasetName", "",
               placeholder="Name your dataset",
               width = "90%"),
    initialKmeans = checkboxInput("topic.initialize", "Initialize with KMeans",
                    value = TRUE, width="auto"),
    numClusters = numericInput('num.clusters', "Number of clusters", value=10),
    startButton = actionButton("topic.start", "Start")
)