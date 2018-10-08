#' Convert flat Trellis model to LDAvis format
#'
#' TODO(tfs): documentation in R doc
#'
#' @aliases toLDAvis
#' @param model.file .RData file containing Trellis model. Must include beta, theta, vocab. Leaves treated as flat model.
#' @param frequency.file .RData file containing term.frequency and doc.length. Must provide either frequency.file or both doc.length and term.frequency.
#' @param doc.length Number of tokens per document, as a vector of integers
#' @param term.frequency Term frequencies, as a vector of integers.
#' @param launch Logical flag. If FALSE, toLDAvis returns the JSON created. Else, launches LDAvis
#' @seealso \pkg{\link{simpleProcessLDA}}
#' @seealso \pkg{\link{simpleProcessSTM}}
#' @seealso \pkg{\link{LDAvis}}
#' @seealso \pkg{\link{servr}}
#' @seealso \pkg{\link{tsne}}
#' @examples
#' # Values from "sample_documents.RData":
#' # "filenames" and "filecontents"
#' if (!requireNamespace(stm)) { stop("Package 'stm' is required for this example") }
#' if (!requireNamespace(LDAvis)) { stop("Package 'LDAvis' is required for this example") }
#' 
#' out.path <- "example_model.RData"
#' ldavis.data.path <- "example_model_ldavis_data.RData"
#' 
#' processed <- stm::textProcessor(filecontents, metadata=as.data.frame(filenames))
#' prepped <- stm::prepDocuments(processed$documents, processed$vocab, processed$meta)
#' model <- stm::stm(documents=prepped$documents, vocab=prepped$vocab, K=k, init.type="Spectral")
#' 
#' # Format for Trellis
#' beta <- exp(model$beta$logbeta[[1]])
#' theta <- model$theta
#' vocab <- prepped$vocab
#' 
#' filenames <- lapply(prepped$meta$filenames, function (x) { gsub("^(\\s|\\r|\\n|\\t)+|(\\s|\\n|\\r|\\t)+$", "", x) })
#' titles <- lapply(filenames, function (x) { URLdecode(gsub("_", " ", x)) })
#' 
#' save(beta, theta, vocab, titles, filenames, file=out.path)
#' 
#' # Calculate/save document lengths and corpus-wide term frequencies
#' doc.length <- lapply(prepped$documents, function (x) { sum(x[2,]) })
#' term.frequency <- rep(0, length(prepped$vocab))
#' 
#' for (doc in prepped$documents) {
#' 		for (i in seq(dim(doc)[2])) {
#' 			oldval <- term.frequency[[doc[1,i]]]
#' 			term.frequency[[doc[1,i]]] <- oldval + doc[2,i]
#' 		}
#' }
#' 
#' term.frequency <- unlist(term.frequency)
#' doc.length <- unlist(doc.length)
#' 
#' save(term.frequency, doc.length, file=ldavis.data.path)
#' 
#' # Use the saved model and ldavis data files to launch LDAvis
#' toLDAvis(model.file = out.path, frequency.file = ldavis.data.path, lauch=TRUE)
#' @export
toLDAvis <- function(model.file = NULL,
					 frequency.file = NULL,
					 beta = NULL,
					 theta = NULL,
					 vocab = NULL,
					 doc.length = NULL,
					 term.frequency = NULL,
					 launch = FALSE) {
	vischeck <- requireNamespace("LDAvis")
	tsnecheck <- requireNamespace("tsne")

	if ((!vischeck) || (!tsnecheck)) {
		stop("Both LDAvis and tsne are required for this method.")
	}

	if (is.null(frequency.file) && (is.null(doc.length) || is.null(term.frequency))) {
		outstr <- "Must provide either a file containing term.frequency and doc.length, or both parameters individually.\n"
		# outstr <- paste0(outstr, "See simpleProcessSTM or simpleProcessLDA for frequency.file example.")
		stop(outstr)
	}

	if (is.null(model.file) && (is.null(beta) || is.null(theta) || is.null(vocab))) {
		outstr <- "Must provide either a file containing a vocabulary and beta and theta values, or all three parameters individually.\n"
		stop(outstr)
	}

	if (is.null(beta) || is.null(theta) || is.null(vocab)) {
		load(model.file)
	}

	if (is.null(doc.length) || is.null(term.frequency)) {
		load(frequency.file)
	}

	if (is.null(doc.length) || is.null(term.frequency) || is.null(beta) || is.null(theta) || is.null(vocab)) {
		stop("ERROR: One or more fields is null. Cannot create LDAvis JSON output.")
	}

	json <- LDAvis::createJSON(phi = beta,
							   theta = theta,
							   doc.length = unlist(doc.length),
							   vocab = vocab,
							   term.frequency = unlist(term.frequency),
							   mds.method = function (x) tsne::tsne(svd(x)$u))

	if (launch) {
		servrcheck <- requireNamespace("servr")

		if (!servrcheck) {
			stop("Please install the servr package to launch LDAvis: install.packages('servr')")
		}

		LDAvis::serVis(json, out.dir = 'ldavis', open.browser = TRUE)
	}

	return(json)
}