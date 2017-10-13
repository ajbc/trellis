# Topic Bubbles

[Sign up for updates and give us feedback!](https://goo.gl/forms/HP7aTlMyMdKChaGi2)

## Demo on Server

We have a demo up on [shinyapps.io](https://bstewart.shinyapps.io/topicBubbles/)!

Please note that this software is intended to be run locally.  The online demo may run much slower than a locally-hosted version.  Please see below for instructions on how to run the software locally.

## Running locally

### Download

Clone the repo:
```
git clone https://github.com/ajbc/topic-bubbles.git
```

### Setup

Install the dependencies in R:
```
install.packages("htmlwidgets")
install.packages("devtools")
install.packages("shiny")
install.packages("shinyjs")
install.packages("stm")
install.packages("V8")
```

Install the htmlwidget for local use:
```
devtools::install("src/htmlwidget")
```

Alternately, install the htmlwidget for remote deployment
```
devtools::install_github("ajbc/topic-bubbles", subdir="src/htmlwidget")
```

### Launching the demo

#### Option 1: from [RStudio](https://www.rstudio.com)
- open `src/shiny/server.R`
- click `Run App`

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
- `processed`: output of the `textProcessor` function
- `out`: output of the `prepDocuments` function
- `model`: an STM model object
- `doc.summaries`: a list of summaries for each document; will be used to display documents

See `dat/process.R` or the abbreviated example below.

#### Example
```
library(stm)
library(data.table)

data <- as.data.frame(fread("dat/poliblogs2008.csv"))
processed <- textProcessor(data$documents, metadata = data)
out <- prepDocuments(processed$documents, processed$vocab, processed$meta)
model <- stm(documents=out$documents, vocab=out$vocab, K=100, init.type="Spectral")
doc.summaries <- lapply(data$documents, substr, start=1, stop=300)

save(processed, out, model, doc.summaries, file="dat/poliblogs2008.K100.RData")
```
Both `dat/poliblogs2008.csv` and `dat/poliblogs2008.K100.RData` are included as examples.

### Supported Interactions

- adjust the number of default clusters (note that this removes any manual adjustments, so do it first!)
- *click* to zoom on a circle
- *double-click* to select a circle (when nothing currently selected); selected circles turn blue
- when you have a circle selected, *double-click* a target location to move or merge bubble (original topics move, clusters merge)
- when you have a circle selected, *shift+double-click* to create a new subcluster that contains that circle
- click the download button to download the manual hierarchical clustering
