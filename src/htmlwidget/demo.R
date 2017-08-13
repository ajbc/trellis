library(htmltools)
library(htmlwidgets)
library(devtools)
setwd("/Users/gwg/Academic/topic-bubbles-scratch2")
# setwd("/Users/gwg/topicbubbles")

devtools::install("/Users/ajbc/Projects/Academic/topic-bubbles-scratch2/src/htmlwidget")
# devtools::install("src/htmlwidget")
library(topicBubbles)

load("dat/poliblogs2008.K100.RData")
beta <- exp(model$beta$logbeta[[1]])
theta <- model$theta
N.clusters <- 20
kmeans.fit <- kmeans(beta, N.clusters)
K <- nrow(beta)
titles <- c()
for (k in seq(K)) {
  title <- paste(out$vocab[order(beta[k,], decreasing=TRUE)][seq(5)], collapse=" ")
  titles <- c(titles, title)
}

#parent.id, topic.id, weight, title
data <- data.frame(parentID=0,
                   nodeID=seq(N.clusters),
                   weight=0,
                   title="")
data <- rbind(data,
              data.frame(parentID=kmeans.fit$cluster,
                         nodeID=seq(N.clusters+1,N.clusters+K),
                         weight=colSums(theta),
                         title=titles))

# Reinstall htmlwidget for development/debugging
devtools::install("src/htmlwidget") 
library(topicBubbles)

topicBubbles(data)