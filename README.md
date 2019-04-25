# Trellis: Topic Model Aggregation and Visualization

Trellis aims to facilitate text corpus exploration and provide an interactive approach to refining a topic model.
The Trellis application allows users to take topic models with large numbers of topics and form hierarchies from these topics.
This hierarchy can be used to organize and sort the underlying text corpus, allowing users to find or read documents related to a topic.

Trellis is intended to be run locally. It is impractical to upload thousands or tens of thousands of text files, so we use the `shinyFiles` package to access files locally. The tool will therefore not be functional if deployed to a remote server.

## Installation

Until Trellis is released on CRAN, the easiest way to install is with `devtools::install_github("ajbc/trellis", build_vignettes=TRUE)`.

## Use

Use `trellis::launchTrellis()` to start the application.
See `vignette("trellis")` for details.

# Feedback

Trellis is young and undergoing active development. If you have any feedback, please submit an issue to this repository or email Thomas Schaffner at t.f.schaffner [AT] gmail.com
