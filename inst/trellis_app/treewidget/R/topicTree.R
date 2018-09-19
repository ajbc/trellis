#' <Add Title>
#'
#' <Add Description>
#'
#' @import htmlwidgets
#'
#' @export
topicTree <- function(data,
                      width = NULL,
                      height = NULL,
                      elementId = NULL,
                      node.color = "#64afff",
                      text.color = "#FFFFFF") {
	# create options
	options <- list(
		nodeColor = node.color,
		textColor = text.color
	)

	# forward options using x
	x = list(
		data = data,
		options = options
	)

	# create widget
    htmlwidgets::createWidget(
		name = 'topicTree',
		x,
		width = width,
		height = height,
		package = 'topicTree',
		elementId = elementId
	)
}

# Copied from topicBubbles.R:

#' Shiny bindings for topicTree
#'
#' Output and render functions for using topicTree within Shiny
#' applications and interactive Rmd documents.
#'
#' @param outputId output variable to read from
#' @param width,height Must be a valid CSS unit (like \code{'100\%'},
#'   \code{'400px'}, \code{'auto'}) or a number, which will be coerced to a
#'   string and have \code{'px'} appended.
#' @param expr An expression that generates a topicTree
#' @param env The environment in which to evaluate \code{expr}.
#' @param quoted Is \code{expr} a quoted expression (with \code{quote()})? This
#'   is useful if you want to save an expression in a variable.
#'
#' @name topicTree-shiny
#'
#' @export
topicTreeOutput <- function(outputId, width = '100%', height = '100%'){
  htmlwidgets::shinyWidgetOutput(outputId, 'topicTree', width, height, package = 'topicTree')
}

#' @rdname topicTree-shiny
#' @export
renderTopicTree <- function(expr, env = parent.frame(), quoted = FALSE) {
  if (!quoted) { expr <- substitute(expr) } # force quoted
  htmlwidgets::shinyRenderWidget(expr, topicTreeOutput, env, quoted = TRUE)
}
