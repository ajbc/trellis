#' Launch the Trellis shiny app
#' 
#' The Trellis application is a shiny app built to visualize and aggregate
#' text corpus topic models. Trellis operates on pre-fitted topic model.
#' Although the examples in this package show a simple method for generating
#' a topic model, the end result (and usefulness of the Trellis application)
#' depend on this process. Decisions during this process, especially
#' relating to the curation and preprocessing of the text corpus, are not
#' shown explicitly in the Trellis examples. When training your own models,
#' it may be beneficial to think more deeply about this process. For tips and
#' more information about corpus curation,
#' check out http://ajbc.io/resources/data_preprocesing.pdf.
#' 
#' Topic models are also highly dependent on the selection of 'k', the number
#' of topics in the final model. Changing k can have unpredictable effect;
#' increasing k by 1 has the potential to drastically alter all topics or
#' leave the model minimally changed. Trellis operates on the philosophy
#' that a user can train a model with a very large k, then aggregate topics
#' into a hierarchy. Rather than train many models with different values of k,
#' trellis allows users to examine many fine-grained topics and group them
#' together. By exploring these topics (in relation to the corpus itself),
#' a user can arrive at a final "aggregate k" that corresponds with their
#' mental model.
#' 
#' Additionally, Trellis aims to facilitate exploration of the underlying
#' text corpus. At startup, users can specify a directory containing the
#' text files of the corpus (in addition to the relevant model file). The
#' main Trellis interface then allows users to sort text files by topic,
#' and users can read the full text of the files within Trellis. This
#' streamlined process can be useful for exploration of a dataset or
#' aggregation of topics.
#' 
#' All inputs and interactions with Trellis occur through the Trellis
#' interface, after the tool is launched. The help button (a "?") within
#' the Trellis interface provides more details on the tool specifics.
#' See https://github.com/ajbc/trellis for details on the package,
#' development, issues/bugs, and installation options.
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
#' @export
launchTrellis <- function() {
	shiny::runApp(system.file('trellis_app/shiny', package='trellis'), launch.browser = TRUE)
}
