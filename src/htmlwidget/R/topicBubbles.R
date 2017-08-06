#' <Add Title>
#'
#' <Add Description>
#'
#' @import htmlwidgets
#'
#' @export
topicBubbles <- function(data,
                         width = NULL,
                         height = NULL,
                         elementId = NULL,
                         bubble.color = "#156946",
                         text.color = "#FFFFFF") {
    
  # create options
  options = list(
    bubbleColor = bubble.color,
    textColor = text.color
  )
  
  # forward options using x
  x = list(
    data = data,
    options = options
  )

  # create widget
  htmlwidgets::createWidget(
    name = 'topicBubbles',
    x,
    width = width,
    height = height,
    package = 'topicBubbles',
    elementId = elementId
  )
}

#' Shiny bindings for topicBubbles
#'
#' Output and render functions for using topicBubbles within Shiny
#' applications and interactive Rmd documents.
#'
#' @param outputId output variable to read from
#' @param width,height Must be a valid CSS unit (like \code{'100\%'},
#'   \code{'400px'}, \code{'auto'}) or a number, which will be coerced to a
#'   string and have \code{'px'} appended.
#' @param expr An expression that generates a topicBubbles
#' @param env The environment in which to evaluate \code{expr}.
#' @param quoted Is \code{expr} a quoted expression (with \code{quote()})? This
#'   is useful if you want to save an expression in a variable.
#'
#' @name topicBubbles-shiny
#'
#' @export
topicBubblesOutput <- function(outputId, width = '100%', height = '800px'){
  htmlwidgets::shinyWidgetOutput(outputId, 'topicBubbles', width, height, package = 'topicBubbles')
}

#' @rdname topicBubbles-shiny
#' @export
renderTopicBubbles <- function(expr, env = parent.frame(), quoted = FALSE) {
  if (!quoted) { expr <- substitute(expr) } # force quoted
  htmlwidgets::shinyRenderWidget(expr, topicBubblesOutput, env, quoted = TRUE)
}
