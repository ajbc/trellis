#' A simple script to train an LDA base model and format for Trellis
#' 
#' TODO(tfs): Documentation. Is this even useful/good here?
#' 
#' @aliases simpleProcessLDA
#' @param corpus.path Path to directory containing separate text files.
#' @param k Number of topics to train
#' @param out.path Path to output location for the Trellis model. If NULL, ignored.
#' @param ldavis.data.path Path to output location for term.frequency and doc.length. If NULL, ignored. See \code{trellis::toLDAvis}.
#' @seealso \pkg{\link{tm}}
#' @seealso \pkg{\link{topicmodels}}
#' @seealso \link[dest=https://ldavis.cpsievert.me/reviews/reviews.html]{ldavis}
#' @examples
#' \dontrun{# TODO}
#' @export
simpleProcessLDA <- function(corpus.path, k, out.path = NULL, ldavis.data.path = NULL) {
	# Check for appropriate packages
	tmcheck <- requireNamespace("tm")
	topicmodelscheck <- requireNamespace("topicmodels")
	slamcheck <- requireNamespace("slam")
	if ((!tmcheck) || (!topicmodelscheck) || (!slamcheck)) {
		stop("Libraries 'tm', 'slam', and 'topicmodels' are all required for this processing script.")
	}

	# Parse files
	filenames <- list.files(corpus.path)
	files <- lapply(filenames, function(x) { readLines(file.path(corpus.path, x)) })
	docs <- tm::Corpus(tm::VectorSource(files))

	docs <- tm::tm_map(docs, tm::removePunctuation)
	docs <- tm::tm_map(docs, tm::content_transformer(tolower))
	docs <- tm::tm_map(docs, tm::removeNumbers)
	docs <- tm::tm_map(docs, tm::removeWords, tm::stopwords("english"))
	docs <- tm::tm_map(docs, tm::stripWhitespace)
	docs <- tm::tm_map(docs, tm::stemDocument)
	dtm <- tm::DocumentTermMatrix(docs)
	rownames(dtm) <- filenames

	# Run LDA
	lda.model <- topicmodels::LDA(dtm, k)

	# Format for Trellis
	beta <- exp(lda.model@beta)
	theta <- lda.model@gamma
	vocab <- lda.model@terms
	filenames <- rownames(dtm)
	titles <- lapply(filenames, function (x) URLdecode(gsub("_", " ", x)))

	if (!is.null(out.path)) {
		save(beta, theta, vocab, titles, filenames, file=out.path)
	}

	if (!is.null(ldavis.data.path)) {
		term.frequency <- col_sums(dtm)
		doc.length <- c()

		for (i in seq(nrow(dtm))) {
			doc.length <- append(doc.length, sum(dtm[i,]))
		}
		
		save(term.frequency, doc.length, file=ldavis.data.path)
	}
}
