library(stm)
library(data.table)

titles <- as.data.frame(fread("wiki_small_titles.dat", header=FALSE, col.names=c("title"), encoding="UTF-8"))
docs <- as.data.frame(fread("wiki_small_all.dat", sep='\t', header=FALSE, col.names=c("documents")))

processed <- textProcessor(docs$documents, metadata=titles)
out <- prepDocuments(processed$documents, processed$vocab, processed$meta)
model <- stm(documents=out$documents, vocab=out$vocab, K=100, init.type="Spectral")

# topic-word distributions in a K by V matrix
beta <- exp(model$beta$logbeta[[1]])

# document-topic distributions in a D by K matrix
theta <- model$theta

# the vocabulary for the topic model (V words)
vocab <- out$vocab

trim <- function (x) gsub("^(\\s|\\r|\\n|\\t)+|(\\s|\\n|\\r|\\t)+$", "", x)

# the exact filenames
filenames <- lapply(out$meta$title, trim)

maketitle <- function (x) URLdecode(gsub("_", " ", x))

# the space-substituted titles of the documents
titles <- lapply(filenames, maketitle)

save(beta, theta, vocab, titles, filenames, file="wiki.small.K100.RData")