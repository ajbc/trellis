shinyjs.updateTitles = function(titles) {
  var svg = d3.select(".bubbles svg");
  
  svg.traverseTree(svg.data, function(node) {
    node.terms = titles[node.id].split(" ");
  });
};