#' Launch the Trellis shiny app
#'
#' TODO(tfs): documentation with in R doc
#'
#' @aliases launchTrellis
#' @examples
#' \dontrun{launchTrellis()}
#' @export
launchTrellis <- function() {
	shiny::runApp(system.file('trellis_app/shiny', package='trellis'))
}