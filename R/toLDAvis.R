#' Convert flat Trellis model to LDAvis format
#'
#' TODO(tfs): documentation in R doc
#'
#' @aliases toLDAvis
#' @param model.file .RData file containing Trellis model. Must include beta, theta, vocab. Leaves treated as flat model.
#' @param doc.length Number of tokens per document, as a vector.
#' @param term.frequency Term frequencies. Format TBD
#' @param launch Logical flag. If FALSE, toLDAvis returns the JSON created. Else, launches LDAvis
#' @seealso \pkg{\link{LDAvis}}
#' @seealso \pkg{\link{servr}}
#' @examples
#' # TBD (how to deal with example data files?)
#' @export
toLDAvis <- function(model.file, doc.length, term.frequency, launch = FALSE) {
	if (! requireNamespace("LDAvis")) {
		stop("Please install the LDAvis package: install.packages('LDAvis')")
	} else {
		load(model.file)
		json <- LDAvis::createJSON(phi = beta,
								   theta = theta,
								   doc.length = doc.length,
								   vocab = vocab,
								   term.frequency = term.frequency)

		if (launch) {
			servrcheck <- requireNamespace("servr")

			if (!servrcheck) {
				stop("Please install the servr package to launch LDAvis: install.packages('servr')")
			}

			LDAvis::serVis(json, out.dir = 'ldavis', open.browser = TRUE)
		}
	}
}