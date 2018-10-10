#' Launch the Trellis shiny app
#'
#' TODO(tfs): documentation in R doc. DOCUMENT what the package is meant to do
#'            Point to instructional materials for curation of text corpus. See ajbc slides
#' 			  BUild function to separate out file contents into individual text files.
#'            Add little badges to github
#'
#' @aliases launchTrellis
#' @importFrom shinyjs show hide toggleState
#' @import data.table
#' @importFrom xtable sanitize
#' @importFrom irlba ssvd
#' @importFrom rsvd rsvd
#' @importFrom Matrix Matrix
#' @param corpus.path Path to directory containing separate text files.
#' @param k Number of topics to train
#' @param out.path Path to output location for the Trellis model. If NULL, ignored.
#' @param ldavis.data.path Path to output location for term.frequency and doc.length. If NULL, ignored. See \code{trellis::toLDAvis}.
#' @seealso \pkg{\link{stm}}
#' @seealso \link[dest=https://ldavis.cpsievert.me/reviews/reviews.html]{ldavis}
#' @examples
#' \dontrun{
#'     TODO
#' }
#' @export
launchTrellis <- function() {
	shiny::runApp(system.file('trellis_app/shiny', package='trellis'), launch.browser = TRUE)
}
