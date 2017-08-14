# Topic Bubbles

### development notes

Current components:
- a [Shiny](https://shiny.rstudio.com) app (in `src/shiny`)
- an [htmlwidget](http://www.htmlwidgets.org) that uses [d3.js](https://d3js.org)

To work on the htmlwidget (likely in [RStudio](https://www.rstudio.com)):
- `install.packages("htmlwidgets")`
- `install.packages("devtools")`
- `setwd("topicbubbles")` or otherwise navigate to the topicbubbles htmlwidget
- open `src/htmlwidget/demo.R` and run contents
- make any modifications to topicbubbles htmlwidgets source, re-install and re-load widget, and run (last few lines of `demo.R`)
