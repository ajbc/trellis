# Topic Aggregation Tool

[Sign up for updates and give us feedback!](https://goo.gl/forms/HP7aTlMyMdKChaGi2)

This tool is intended to be run locally. It is impractical to upload thousands or tens of thousands of text files, so we use the `shinyFiles` package to access files locally. The tool will therefore not be functional if deployed to a remote server.


## Setup

### Download

Clone the repo:
```
git clone https://github.com/ajbc/topic-bubbles.git
```

### Dependency Installation

Install the dependencies in R:
```
install.packages("htmlwidgets")
install.packages("devtools")
install.packages("shiny")
install.packages("shinyjs")
install.packages("stm")
install.packages("V8")
install.packages("xtable")
install.packages("shinyFiles")
```

Install the htmlwidget for local use:
```
devtools::install("src/bubblewidget")
devtools::install("src/treewidget")
```

### Launching the demo

#### Option 1: from [RStudio](https://www.rstudio.com)

- open `src/shiny/server.R`
- click `Run App`

Note that the tool is designed to be run in a standard web browser, not through the RStudio Viewer Pane.

#### Option 2: from R in terminal

Run the following:
```
library(shiny)
runApp("src/shiny")
```
Then navigate to `http://127.0.0.1:<PORT>` in a browser if not redirected automatically. This should be listed in the terminal as `Listening on http://127.0.0.1:<PORT>`.

## Use

Check out our [tutorial video](https://youtu.be/ItFgB0pbkBg).

### File Format
Upload an `.Rdata` file with three variables:
beta, theta, vocab, titles, filenames
- `beta`: topic-word distributions in a K by V matrix
- `theta`: document-topic distributions in a D by K matrix
- `vocab`: the list of all V vocabular terms
- `titles`: a list of D document titles (could be first 100 characters of the document if no ititles exist)
- `filenames`: optional list of filenames (should be null otherwise) for each document

Optionally, specify a directory with the original documents to browse.

To generate a single text file of all documents given one document per file, use the `dat/collapse_docs.py` script.  To use, specify first a file containing a list of filenames, and then a the directory fo files.  For example: `python collapse_docs.py wiki_titles.dat wiki`.  The resulting file can be used by `dat/process.R`, as shown below.

#### Example
```
library(stm)
library(data.table)

titles <- as.data.frame(fread("wiki_titles.dat", header=FALSE, col.names=c("title")))
docs <- as.data.frame(fread("wiki_all.dat", sep='\t', header=FALSE, col.names=c("documents")))

processed <- textProcessor(docs$documents, metadata=titles)
out <- prepDocuments(processed$documents, processed$vocab, processed$meta)
model <- stm(documents=out$documents, vocab=out$vocab, K=100, init.type="Spectral")

beta <- exp(model$beta$logbeta[[1]])
theta <- model$theta
vocab <- out$vocab
titles <- gsub("_", " ", processed$meta$titles)
filenames <- processed$meta$titles

save(beta, theta, vocab, titles, filenames, file="wiki.K100.RData")
```

Both the raw Wikipedia data and `wiki.K100.RData` are incuded as examples.

### Supported Interactions

- Renaming clusters and topics
- Reclustering the children of a selected cluster
- Deleting a cluster (all children become direct children of the cluster's parent)
- Zooming and panning
- Dragging and dropping to merge or move nodes within the hierarchy
- Exporting an SVG image (not currently funcitoning properly for the tree view)
- Clicking on a document in the lefthand panel to view the full text
- (Tree view) Collapsing a node and its children
