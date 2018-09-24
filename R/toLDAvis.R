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
#' # TBD (how to deal with example data files?)
#' @export
toLDAvis <- function(model.file, frequency.file = NULL, doc.length = NULL, term.frequency = NULL, launch = FALSE) {
	vischeck <- requireNamespace("LDAvis")
	tsnecheck <- requireNamespace("tsne")

	if ((!vischeck) || (!tsnecheck)) {
		stop("Both LDAvis and tsne are required for this method.")
	}

	if (is.null(frequency.file) && (is.null(doc.length) || is.null(term.frequency))) {
		outstr <- "Must provide either a file containing term.frequency and doc.length, or both parameters individually.\n"
		outstr <- paste0(outstr, "See simpleProcessSTM or simpleProcessLDA for frequency.file example.")
		stop(outstr)
	}

	load(model.file)

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
}