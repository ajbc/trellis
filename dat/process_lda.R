# USAGE: Rscript process_lda.R text_file_directory output_rdata_path K

library(tm)
library(topicmodels)

log <- function (msg) {
	print(paste(Sys.time(), ":", msg))
}

debug <- function(msg) {
	log(paste("!!!!!!!!", msg, "!!!!!!!!"))
}

parse.files <- function(dir) {
	# Uses all files within the specified directory to train LDA
	# Ref: https://rstudio-pubs-static.s3.amazonaws.com/266565_171416f6c4be464fb11f7d8200c0b8f7.html
	log("Parsing files")
	filenames <- list.files(dir)
	files <- lapply(filenames, function(x) { readLines(file.path(dir, x)) })
	docs <- Corpus(VectorSource(files))
	log("----Files parsed")

	# Process file text
	# Ref: https://rstudio-pubs-static.s3.amazonaws.com/266565_171416f6c4be464fb11f7d8200c0b8f7.html
	log("Preprocessing files")
	docs <- tm_map(docs, removePunctuation)
	docs <- tm_map(docs, content_transformer(tolower))
	docs <- tm_map(docs, removeNumbers)
	docs <- tm_map(docs, removeWords, stopwords("english"))
	docs <- tm_map(docs, stripWhitespace)
	docs <- tm_map(docs,stemDocument)
	dtm <- DocumentTermMatrix(docs)
	rownames(dtm) <- filenames

	log("----Files preprocessed")

	return(dtm)
}

run.lda <- function(dtm, k) {
	# Run LDA
	log("Running LDA")
	lda.model <- LDA(dtm, k)
	log("----LDA fit complete")

	return(lda.model)
}

format.trellis <- function(dtm, lda.model, outpath) {
	beta <- exp(lda.model@beta)
	theta <- lda.model@gamma
	vocab <- lda.model@terms
	filenames <- rownames(dtm)
	titles <- lapply(filenames, function (x) URLdecode(gsub("_", " ", x)))
	file <- outpath

	save(beta, theta, vocab, titles, filenames, file=outpath)
}

pipeline <- function(dir, outpath, k) {
	dtm <- parse.files(dir)
	lda.model <- run.lda(dtm, k)
	format.trellis(dtm, lda.model, outpath)
}

# Pass in directory path
args <- commandArgs(trailingOnly=TRUE)

if (length(args) < 3) {
	print("You must specify a text file directory and an output file path and a K!")
	print("USAGE: Rscript process_lda.R text_file_directory output_rdata_path K")
} else {
	dir <- args[[1]]
	outpath <- args[[2]]
	k <- as.integer(args[[3]])

	pipeline(dir, outpath, k)
}