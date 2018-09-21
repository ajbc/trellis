#' Convert flat Trellis model to LDAvis format
#'
#' TODO(tfs): documentation in R doc
#'
#' @aliases toLDAvis
#' @param model Trellis model, formatted as list. Must include beta, theta, vocab
#' @param doc.length Number of tokens per document, as a vector.
#' @param term.frequency Term frequencies. Format TBD
#' @param launch Logical flag. If FALSE, toLDAvis returns the JSON created. Else, launches LDAvis
#' @seealso \pkg{\link{LDAvis}}
#' @examples
#' # TBD (how to deal with example data files?)
#' @export
toLDAvis <- function(model, doc.length, term.frequency, launch = FALSE) {
	if (! requireNamespace("LDAvis", quietly = TRUE)) {
		stop("Please install the LDAvis package: install.packages('LDAvis')")
	} else {
		json <- LDAvis::createJSON(phi = model$beta,
								  theta = model$theta,
								  doc.length = doc.length,
								  vocab = model$vocab,
								  term.frequency = term.frequency)

		if (launch) {
			LDAvis::serVis(json, out.dir = 'ldavis', open.browser = TRUE)
		}
	}
}