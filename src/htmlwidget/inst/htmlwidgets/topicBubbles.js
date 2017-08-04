HTMLWidgets.widget({

  name: 'topicBubbles',
  type: 'output',
  
  initialize: function(el, width, height) {

    d3.select(el).append("svg")
        .attr("width", width)
        .attr("height", height);

    return d3.forceSimulation();
  },
  
  resize: function(el, width, height, force) {

    d3.select(el).select("svg")
        .attr("width", width)
        .attr("height", height);

    force.force("center", d3.forceCenter(width / 2, height / 2))
        .restart();
  },
  
  renderValue: function(el, x, force) {
    var data = { id: "root", children: [], title: "", terms: []};
    var srcData = HTMLWidgets.dataframeToD3(x.data);
    
    // helper function to add hierarchical structure to data
    function findParent(branch, parentID, nodeID) {
      if (parentID === 0)
        parentID = "root";
      
      var rv = null;

        if (branch.id == parentID) {
          rv = branch;
        } else if (rv === null) {
          if (branch.children !== undefined) {
            $.each(branch.children, function(i) {
                if (rv === null)
                  rv = findParent(branch.children[i], parentID, nodeID);
            });
          }
        }
      return rv;
    }
    
    // For each data row add to the output tree
    srcData.forEach(function(d) {
      // find parent
      var parent = findParent(data, d.parentID, d.nodeID);
      
      // leaf node
      if (d.weight === 0) {
        parent.children.push({
          id: d.nodeID,
          title: "",
          terms: [],
          children : []
        });
      } else if (parent !== null) {
        if (parent.hasOwnProperty('children')) {
          parent.children.push({
            id: d.nodeID,
            title : d.title,
            terms : d.title.split(" "),
            weight : d.weight
          });
        }
      }
    });

    var svg = d3.select("svg"),
        margin = 20,
        diameter = +svg.attr("width"),
        g = svg.append("g").attr("transform", "translate(" + diameter / 2 + "," + diameter / 2 + ")");
    
    var color = d3.scaleLinear()
        .domain([0, 1])
        .range(["hsl(155,30%,82%)", "hsl(155,66%,25%)"])
        .interpolate(d3.interpolateHcl);
    
    var pack = d3.pack()
        .size([diameter - margin, diameter - margin])
        .padding(10);
        
    root = d3.hierarchy(data)
      .sum(function(d) { return d.weight; })
      .sort(function(a, b) { return b.value - a.value; });
      
    var focus = root,
    nodes = pack(root).descendants(),
    view;

    var circle = g.selectAll("circle")
      .data(nodes)
      .enter().append("circle")
        .attr("class", function(d) { return d.parent ? d.children ? "node" : "node node--leaf" : "node node--root"; })
        .style("fill", function(d) { return d.children ? color(d.depth) : null; })
        .on("click", function(d) {})
        .on("dblclick", function(d) { if (focus !== d) zoom(d), d3.event.stopPropagation(); });
  
    /*var text = g.selectAll("text")
      .data(nodes)
      .enter().append("text")
        .attr("class", "label")
        .style("fill-opacity", function(d) { return d.parent === root ? 1 : 0; })
        .style("display", function(d) { return d.parent === root ? "inline" : "none"; })
        .text(function(d) { return d.data.title; });*/
  var text = g.selectAll("text")
      .data(nodes)
      .enter().append("text")
        .attr("class", "label")
        .style("fill-opacity", function(d) { return d.parent === root ? 1 : 0; })
        .style("display", function(d) { return d.parent === root ? "inline" : "none"; })
        .each(function (d) {
          for (var i = 0; i < d.data.terms.length; i++) {
            d3.select(this).append("tspan")
              .text(function() { return d.data.terms[i]; })
                .attr("y", 12*(i+0.75-d.data.terms.length/2))
                .attr("x", 0)
                .attr("text-anchor", "middle");
          }
        });
    
    var node = g.selectAll("circle,text");
  
    svg
        .style("background", "#FFF")
        .on("dblclick", function() { zoom(root); });
  
    zoomTo([root.x, root.y, root.r * 2 + margin]);
  
    function zoom(d) {
      var focus0 = focus; focus = d;
  
      var transition = d3.transition()
          .duration(d3.event.altKey ? 7500 : 750)
          .tween("zoom", function(d) {
            var i = d3.interpolateZoom(view, [focus.x, focus.y, focus.r * 2 + margin]);
            return function(t) { zoomTo(i(t)); };
          });
  
      transition.selectAll("text")
        .filter(function(d) { return d.parent === focus || this.style.display === "inline"; })
          .style("fill-opacity", function(d) { return d.parent === focus ? 1 : 0; })
          .on("start", function(d) { if (d.parent === focus) this.style.display = "inline"; })
          .on("end", function(d) { if (d.parent !== focus) this.style.display = "none"; });
    }
  
    function zoomTo(v) {
      var k = diameter / v[2]; view = v;
      node.attr("transform", function(d) { return "translate(" + (d.x - v[0]) * k + "," + (d.y - v[1]) * k + ")"; });
      circle.attr("r", function(d) { return d.r * k; });
    }
  }
});

