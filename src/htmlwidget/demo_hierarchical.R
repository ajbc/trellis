library(htmltools)
library(htmlwidgets)
library(devtools)
setwd("/Users/ajbc/Projects/Academic/topic-bubbles-scratch3")
# setwd("/Users/gwg/topicbubbles")

devtools::install(file.path(getwd(), "src/htmlwidget"))
library(topicBubbles)

load("dat/poliblogs2008.K100.RData")
beta <- exp(model$beta$logbeta[[1]])

# leaf titles
theta <- model$theta
K <- nrow(beta)
V <- ncol(beta)
titles <- c()
for (k in seq(K)) {
  title <- paste(out$vocab[order(beta[k,], decreasing=TRUE)][seq(5)], collapse=" ")
  titles <- c(titles, title)
}

# first tier clusters
N.clusters <- 10
kmeans.fit <- kmeans(beta, N.clusters)
marginal.topic.titles <- c()
for (n in seq(N.clusters)) {
  marginal.beta <- rep(0, V)
  for (k in seq(K)) {
    if (n == kmeans.fit$cluster[k])
      marginal.beta <- marginal.beta + beta[k,]
  }
  title <- paste(out$vocab[order(marginal.beta, decreasing=TRUE)][seq(5)], collapse=" ")
  marginal.topic.titles <- c(marginal.topic.titles, title)
}

freq <- as.data.frame(table(kmeans.fit$cluster))
freq <- freq[freq$Freq>5,]

leaf.parent.ids <- K+kmeans.fit$cluster
middle.parent.ids <- rep(0, N.clusters)
N.nodes <- N.clusters
N.clusters2 <- 3
for (var in freq$Var1) {
  var <- as.numeric(var)
  #randomly leave some out
  partial.beta <- beta[kmeans.fit$cluster==var,]
  kmeans.fit2 <- kmeans(partial.beta, N.clusters2)
  select <- TRUE & rbinom(nrow(partial.beta), size=1, prob=0.9)
  leaf.parent.ids[leaf.parent.ids==(K+as.numeric(var))][select] <- kmeans.fit2$cluster[select] + N.nodes + K
  
  #middle.parent.ids[as.numeric(var)] <- K + N.nodes
  middle.parent.ids <- c(middle.parent.ids, rep(var+K, N.clusters2))
  
  for (n in seq(N.clusters2)) {
    marginal.beta <- rep(0, V)
    for (k in seq(nrow(partial.beta))) {
      if (n == kmeans.fit2$cluster[k])
        marginal.beta <- marginal.beta + partial.beta[k,]
    }
    title <- paste(out$vocab[order(marginal.beta, decreasing=TRUE)][seq(5)], collapse=" ")
    marginal.topic.titles <- c(marginal.topic.titles, title)
  }
  
  N.nodes <- N.nodes + N.clusters2
}

# parent.id, topic.id, weight, title
data <- data.frame(parentID=leaf.parent.ids,
                   nodeID=seq(K),
                   weight=colSums(theta),
                   title=titles)

data <- rbind(data.frame(parentID=middle.parent.ids,
                         nodeID=seq(K+1, K+N.nodes),
                         weight=0,
                         title=marginal.topic.titles),
              data)

# Reinstall htmlwidget for development/debugging
devtools::install("src/htmlwidget")
library(topicBubbles)

topicBubbles(data)
