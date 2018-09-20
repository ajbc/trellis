#' Launch the Trellis shiny app
#'
#' TODO(tfs): documentation with in R doc
#'
#' @aliases launchTrellis
#' @examples
#' \dontrun{launchTrellis()}
#' @export
launchTrellis <- function() {
	# Load packages required for server to run properly
	library(shinyjs)
	library(jsonlite)
	library(data.table)
	library(xtable) # Used to sanitize output
	library(Matrix) # Used for sparse beta
	library(irlba)  # Used for fast SVD
	library(rsvd)

	shiny::runApp(system.file('trellis_app/shiny', package='trellis'))
}