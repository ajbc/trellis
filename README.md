# Topic Bubbles

### Download

Clone the repo and checkout the working version:
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
```

From the `topic-bubbles` directory, install the htmlwidget:
```
devtools::install(file.path(getwd(),"src/htmlwidget"))
```
Any time the source is updated, the htmlwidget needs to be reinstalled.

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

### Using the demo
Upload an `.Rdata` file with three variables:
-
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
