#' Given a lists/vectors of filenames, generate a directory of .txt files
#' 
#' Many packages and tutorials in R operate primarily on .CSV files
#' containing all text of a corpus. However, to avoid loading the entire
#' text corpus at once, Trellis requires a directory of individual text
#' files in order to read files within the main Trellis interface.
#' writeCorpusFiles takes a list or vector of files (and filenames)
#' and writes out each file individually as a .txt file.
#' 
#' @aliases writeCorpusFiles
#' @param fileContents List or vector of the text of all documents
#' @param fileNames List or vector, of the same size as fileContents (and in the same order)
#' @param outDirectory Directory in which to write .txt files
#' @param forceDirectory Logical flag. If TRUE, will create the output directory if it doesn't exist.
#' @examples
#' # Values from "sample_documents.RData":
#' # "filenames" and "filecontents"
#' 
#' writeCorpusFiles(filecontents, filenames, "./example_corpus", forceDirectory = TRUE)
#' @export
writeCorpusFiles <- function(fileContents, fileNames, outDirectory, forceDirectory = FALSE) {
	dirCheck <- dir.exists(outDirectory)

	# Check lengths of fileContents and fileNames
	if (is.null(fileContents) || is.null(fileNames) || length(fileContents) == 0 || length(fileNames) == 0) {
		print("Must provide nonempty files.")
		return(NULL)
	} else if (length(fileContents) != length(fileNames)) {
		print("fileContents and fileNames are of different lengths.")
		return(NULL)
	}

	# Directory does not exist and logical flag indicates not to create it
	if (!forceDirectory && !dirCheck) {
		outStr <- "Directory does not exist. Choose another directory or "
		outStr <- paste0(outStr, "specify 'forceDirectory = TRUE' to create the directory.")
		print(outStr)
		return(NULL)
	}

	# Create directory if necessary
	if (!dirCheck && forceDirectory) {
		dir.create(outDirectory)
	}

	# Loop through all files, writing to outDirectory
	for (i in seq(length(fileContents))) {
		fname <- fileNames[[i]]
		fcon <- fileContents[[i]]

		if (!endsWith(fname, ".txt")) {
			fname <- paste0(fname, ".txt")
		}

		writeLines(fcon, file.path(outDirectory, fname))
	}
}