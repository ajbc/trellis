#' Launch the Trellis shiny app
#'
#' TODO(tfs): documentation in R doc
#'
#' @aliases launchTrellis
#' @importFrom shinyjs show hide toggleState
#' @import data.table
#' @importFrom xtable sanitize
#' @importFrom irlba ssvd
#' @importFrom rsvd rsvd
#' @importFrom Matrix Matrix
#' @examples
#' \dontrun{launchTrellis()}
#' @export
launchTrellis <- function() {
	shiny::runApp(system.file('trellis_app/shiny', package='trellis'))
}