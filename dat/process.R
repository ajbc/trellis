library(stm)
library(data.table)

data <- as.data.frame(fread("poliblogs2008.csv"))

processed <- textProcessor(data$documents, metadata = data)
out <- prepDocuments(processed$documents, processed$vocab, processed$meta)
model <- stm(documents=out$documents, vocab=out$vocab, K=100, init.type="Spectral")

#document text is in:
out$meta$documents

#document-topic proportions are in the N by K matrix
model$theta

#topic-word distributions are in the K by V matrix
beta <- exp(model$beta$logbeta[[1]])

doc.summaries <- lapply(data$documents, substr, start=1, stop=300)

save(processed, out, model, doc.summaries, file="poliblogs2008.K100.RData")
