#' A simple script to train an LDA base model and format for Trellis
#' 
#' TODO(tfs): Documentation. Is this even useful/good here?
#' 
#' @aliases simpleProcessLDA
#' @param corpus.path Path to directory containing separate text files.
#' @param out.path Path to output location for the Trellis model
#' @param k Number of topics to train
#' @seealso \pkg{\link{trellis.data}} TODO(tfs): Make this a package, or something?
#' @seealso \pkg{\link{tm}}
#' @seealso \pkg{\link{topicmodels}}
#' @examples
#' # TBD
#' @export
simpleProcessLDA <- function(corpus.path, out.path, k) {
	# TODO(tfs): Add option for saving extra ldavis data

	# Check for appropriate packages
	tmcheck <- requireNamespace("tm", quiet = TRUE)
	topicmodelscheck <- requireNamespace("topicmodels", quiet = TRUE)
	if ((!tmcheck) || (!topicmodelscheck)) {
		stop("Libraries 'tm' and 'topicmodels' are both required for this processing script.")
	}

	# Parse files
	filenames <- list.files(corpus.path)
	files <- lapply(filenames, function(x) { readLines(file.path(corpus.path, x)) })
	docs <- Corpus(VectorSource(files))

	docs <- tm_map(docs, removePunctuation)
	docs <- tm_map(docs, content_transformer(tolower))
	docs <- tm_map(docs, removeNumbers)
	docs <- tm_map(docs, removeWords, stopwords("english"))
	docs <- tm_map(docs, stripWhitespace)
	docs <- tm_map(docs,stemDocument)
	dtm <- DocumentTermMatrix(docs)
	rownames(dtm) <- filenames

	# Run LDA
	lda.model <- LDA(dtm, k)

	# Format for Trellis
	beta <- exp(lda.model@beta)
	theta <- lda.model@gamma
	vocab <- lda.model@terms
	filenames <- rownames(dtm)
	titles <- lapply(filenames, function (x) URLdecode(gsub("_", " ", x)))

	save(beta, theta, vocab, titles, filenames, file=out.path)
}