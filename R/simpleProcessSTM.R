#' A simple script to train a STM base model and format for Trellis
#' 
#' TODO(tfs): Documentation. Is this even useful/good here?
#' 
#' @aliases simpleProcessLDA
#' @param corpus.path Path to directory containing separate text files.
#' @param k Number of topics to train
#' @param out.path Path to output location for the Trellis model. If NULL, ignored.
#' @param ldavis.data.path Path to output location for term.frequency and doc.length. If NULL, ignored. See \code{trellis::toLDAvis}.
#' @seealso \pkg{\link{stm}}
#' @seealso \link[dest=https://ldavis.cpsievert.me/reviews/reviews.html]{ldavis}
#' @examples
#' \dontrun{# TODO}
#' @export
simpleProcessSTM <- function(corpus.path, k, out.path = NULL, ldavis.data.path = NULL) {
	# Check for appropriate packages
	stmcheck <- requireNamespace("stm")
	if (!stmcheck) {
		stop("Library 'stm' is required for this processing script.")
	}

	# Parse files
	filenames <- list.files(corpus.path)
	files <- lapply(filenames, function(x) { readLines(file.path(corpus.path, x)) })
	processed <- stm::textProcessor(files, metadata=as.data.frame(filenames))
	prepped <- stm::prepDocuments(processed$documents, processed$vocab, processed$meta)
	model <- stm::stm(documents=prepped$documents, vocab=prepped$vocab, K=k, init.type="Spectral")

	# Format for Trellis
	beta <- exp(model$beta$logbeta[[1]])
	theta <- model$theta
	vocab <- prepped$vocab

	filenames <- lapply(prepped$meta$filenames, function (x) { gsub("^(\\s|\\r|\\n|\\t)+|(\\s|\\n|\\r|\\t)+$", "", x) })
	titles <- lapply(filenames, function (x) { URLdecode(gsub("_", " ", x)) })

	if (!is.null(out.path)) {
		save(beta, theta, vocab, titles, filenames, file=out.path)
	}

	# Calculate/save document lengths and corpus-wide term frequencies
	if (!is.null(ldavis.data.path)) {
		doc.length <- lapply(prepped$documents, function (x) { sum(x[2,]) })
		term.frequency <- rep(0, length(prepped$vocab))

		for (doc in prepped$documents) {
			for (i in seq(dim(doc)[2])) {
				oldval <- term.frequency[[doc[1,i]]]
				term.frequency[[doc[1,i]]] <- oldval + doc[2,i]
			}
		}

		term.frequency <- unlist(term.frequency)
		doc.length <- unlist(doc.length)

		save(term.frequency, doc.length, file=ldavis.data.path)
	}
}
