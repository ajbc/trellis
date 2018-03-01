library(stm)
library(data.table)

titles <- as.data.frame(fread("wiki_titles.dat", header=FALSE, col.names=c("title")))
docs <- as.data.frame(fread("wiki_all.dat", sep='\t', header=FALSE, col.names=c("documents")))

processed <- textProcessor(docs$documents, metadata=titles)
out <- prepDocuments(processed$documents, processed$vocab, processed$meta)
model <- stm(documents=out$documents, vocab=out$vocab, K=100, init.type="Spectral")

# topic-word distributions in a K by V matrix
beta <- exp(model$beta$logbeta[[1]])

# document-topic distributions in a D by K matrix
theta <- model$theta

# the vocabulary for the topic model (V words)
vocab <- out$vocab

# the titles for the documents
titles <- gsub("_", " ", processed$meta$titles)

# the filenames
filenames <- processed$meta$titles

save(beta, theta, vocab, titles, filenames, file="wiki.K100.RData")