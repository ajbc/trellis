# USAGE: python collapse_docs.py title_file document_directory

import sys, os

titles = [title.strip() for title in open(sys.argv[1]).readlines()]

doc_dir = sys.argv[2]

docs = open(doc_dir.strip('/') + '_all.dat', 'w+')
for title in titles:
    doc = open(os.path.join(doc_dir, title)).read()
    doc = doc.replace('\n', ' ')
    docs.write(doc + '\n')
docs.close()
