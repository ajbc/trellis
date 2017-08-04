HTMLWidgets.widget({

    name: 'topicBubbles',
    type: 'output',
    selectedTopic: null,
    view: null,
    nodeInFocus: null,

    initialize: function (el, width, height) {
        d3.select(el)
            .append("svg")
            .attr("width", width)
            .attr("height", height);
    },

    resize: function (el, width, height, force) {
        d3.select(el)
            .select("svg")
            .attr("width", width)
            .attr("height", height);
    },

    renderValue: function (el, x, force) {
        var self = this,
            data = self.getTreeFromRawData(x),
            svg = d3.select("svg"),
            MARGIN = 20,
            DIAMETER = +svg.attr("width"),
            g = svg.append("g").attr("transform", "translate(" + DIAMETER / 2 + "," + DIAMETER / 2 + ")");

        var color = d3.scaleLinear()
            .domain([-1, 5])
            .range(["hsl(152,80%,80%)", "hsl(228,30%,40%)"])
            .interpolate(d3.interpolateHcl);

        var pack = d3.pack()
            .size([DIAMETER - MARGIN, DIAMETER - MARGIN])
            .padding(2);

        var root = d3.hierarchy(data)
            .sum(function (d) {
                return d.weight;
            })
            .sort(function (a, b) {
                return b.value - a.value;
            });

        self.nodeInFocus = root;
        var nodes = pack(root).descendants();

        var circle = g.selectAll("circle")
            .data(nodes)
            .enter()
            .append("circle")
            .attr("class", function (d) {
                if (d.parent) {
                    return d.children ? "node node--middle" : "node node--leaf";
                } else {
                    return "node node--root";
                }
            })
            .style("pointer-events", "visible")
            .style("fill", function (d) {
                return d.children ? color(d.depth) : null;
            });

        g.selectAll(".node--middle")
            .on("click", function(d) {
                if (self.nodeInFocus !== d) {
                    self.zoom(d, DIAMETER, MARGIN, node, circle);
                    d3.event.stopPropagation();
                }
            });

        g.selectAll(".node--leaf")
            .on("click", function(d) {
                d3.event.stopPropagation();
                if (!self.selectedTopic) {
                    $(this).addClass('highlight');
                    self.selectedTopic = this;
                } else{
                    console.log('add to new middle node');
                    self.selectedTopic = null;
                    $('circle').removeClass('highlight');
                }
            });

        var text = g.selectAll("text")
            .data(nodes)
            .enter().append("text")
            .attr("class", "label")
            .style("fill-opacity", function (d) {
                return d.parent === root ? 1 : 0;
            })
            .style("display", function (d) {
                return d.parent === root ? "inline" : "none";
            })
            .each(function (d) {
                for (var i = 0; i < d.data.terms.length; i++) {
                    d3.select(this).append("tspan")
                        .text(function () {
                            return d.data.terms[i];
                        })
                        .attr("y", 12 * (i + 0.75 - d.data.terms.length / 2))
                        .attr("x", 0)
                        .attr("text-anchor", "middle");
                }
            });

        var node = g.selectAll("circle,text");

        svg.style("background", color(-1))
            .on("click", function () {
                self.zoom(root, DIAMETER, MARGIN, node, circle);
            });

        self.zoomTo([root.x, root.y, root.r * 2 + MARGIN], DIAMETER, node, circle);
    },

    zoom: function(d, diameter, margin, node, circle) {
        var self = this;
        self.nodeInFocus = d;

        var transition = d3.transition()
            .duration(d3.event.altKey ? 7500 : 750)
            .tween("zoom", function (d) {
                var coords = [self.nodeInFocus.x, self.nodeInFocus.y, self.nodeInFocus.r * 2 + margin],
                    i = d3.interpolateZoom(self.view, coords);
                return function (t) {
                    self.zoomTo(i(t), diameter, node, circle);
                };
            });

        transition.selectAll("text")
            .filter(function (d) {
                return d.parent === self.nodeInFocus || this.style.display === "inline";
            })
            .style("fill-opacity", function (d) {
                return d.parent === self.nodeInFocus ? 1 : 0;
            })
            .on("start", function (d) {
                if (d.parent === self.nodeInFocus) this.style.display = "inline";
            })
            .on("end", function (d) {
                if (d.parent !== self.nodeInFocus) this.style.display = "none";
            });
    },

    /* Zoom to center of coordinates.
     */
    zoomTo: function(coords, diameter, node, circle) {
        var self = this,
            k = diameter / coords[2];
        self.view = coords;
        node.attr("transform", function (d) {
            return "translate(" + (d.x - coords[0]) * k + "," + (d.y - coords[1]) * k + ")";
        });
        circle.attr("r", function (d) {
            return d.r * k;
        });
    },

    /* Convert R dataframe to tree.
     */
    getTreeFromRawData: function(x) {
        var self = this,
            data = {id: "root", children: [], title: "", terms: []},
            srcData = HTMLWidgets.dataframeToD3(x.data);

        // For each data row add to the output tree
        srcData.forEach(function (d) {
            // find parent
            var parent = self.findParent(data, d.parentID, d.nodeID);

            // leaf node
            if (d.weight === 0) {
                parent.children.push({
                    id: d.nodeID,
                    title: "",
                    terms: [],
                    children: []
                });
            } else if (parent !== null) {
                if (parent.hasOwnProperty('children')) {
                    parent.children.push({
                        id: d.nodeID,
                        title: d.title,
                        terms: d.title.split(" "),
                        weight: d.weight
                    });
                }
            }
        });

        return data;
    },

    /* Helper function to add hierarchical structure to data.
     */
    findParent: function(branch, parentID, nodeID) {
        var self = this;
        if (parentID === 0) {
            parentID = "root";
        }

        var rv = null;
        if (branch.id == parentID) {
            rv = branch;
        } else if (rv === null) {
            if (branch.children !== undefined) {
                $.each(branch.children, function (i) {
                    if (rv === null) {
                        rv = self.findParent(branch.children[i], parentID, nodeID);
                    }
                });
            }
        }
        return rv;
    }
});

