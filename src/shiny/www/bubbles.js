shinyjs.init = function() {
  //Circle Data Set
  var circleData = [
    { "cx": 20, "cy": 20, "radius": 20, "color" : "green" },
    { "cx": 70, "cy": 70, "radius": 20, "color" : "purple" }];
  
  //Create the SVG Viewport
  var svgContainer = d3.select("svg");
  
  //Add circles to the svgContainer
  var circles = svgContainer.selectAll("circle")
                           .data(circleData)
                           .enter()
                           .append("circle");
  
  //Add the circle attributes
  var circleAttributes = circles
                         .attr("cx", function (d) { return d.cx; })
                         .attr("cy", function (d) { return d.cy; })
                         .attr("r", function (d) { return d.radius; })
                         .style("fill", function (d) { return d.color; });
};