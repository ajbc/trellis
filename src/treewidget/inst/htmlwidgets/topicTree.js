// REF: http://bl.ocks.org/shubhgo/80323b7f3881f874c02f
// REF: https://bl.ocks.org/d3noob/43a860bc0024792f8803bba8ca0d5ecd
// REF: https://bl.ocks.org/d3noob/b024fcce8b4b9264011a1c3e7c7d70dc


HTMLWidgets.widget({
    name: "topicTree",
    type: "output",

    PAGE_MARGIN: 10,
    TOP_MARGIN: 75,
    FONT_SIZE: 11,
    BORDER_MARGIN: 10,
    CIRCLE_RADIUS: 7,
    TERMINAL_NODE_RADIUS: 4,
    COLLAPSED_NODE_RADIUS: 10,
    FONT_SIZE: 8,
    TEXT_HEIGHT_OFFSET: 2,

    MIN_EDGE_WIDTH: 1,
    MAX_EDGE_WIDTH: 10,

    treeData: null,
    maxNodeWeight: 1,

    draggedNode: null,

    initialize: function (el, width, height) {
        var self = this;

        self.el = el;

        // Ref: https://bl.ocks.org/mbostock/34f08d5e11952a80609169b7917d4172
        // Ref: https://bl.ocks.org/mbostock/4987520
        // Ref: https://bl.ocks.org/emepyc/7218bc9ea76951d6a78b0c7942e07a00
        var zoomHandler = d3.zoom()
            .scaleExtent([1, 40])
            .translateExtent([[0,0], [Infinity, height]])
            .on("zoom", self.zoomHandler(self));


        var svg = d3.select(el)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("id", "tree-svg")
            .call(zoomHandler)
            .on("dblclick.zoom", null);

        self.g = svg.append("g")
            .attr("id", "tree-root");
            // Maybe a transform, see if it can work without

        // TODO(tfs): This is an ugly way of structuring the corrections for margins, should probably restructure
        // Ref: https://github.com/d3/d3-hierarchy/blob/master/README.md#tree
        self.tree = d3.tree()
            .size([height-(2*self.BORDER_MARGIN)-self.TOP_MARGIN, width-(2*self.BORDER_MARGIN)])
            .separation(function (left, right) {
                console.log(left, right);
                return (left.parent.data.id === right.parent.data.id) ? 10 : 15;
            });

        self.edgeWidthMap = d3.scaleLinear()
                            .domain([0, 1])
                            .range([self.MIN_EDGE_WIDTH, self.MAX_EDGE_WIDTH]);
    },


    zoomHandler: function (selfRef) {
        var handler = function () {
            console.log(d3.event);
            selfRef.g.attr("transform", "translate(" + d3.event.transform.x + "," + d3.event.transform.y + ")" + "scale(" + d3.event.transform.k + ")");
            d3.event.sourceEvent.stopPropagation();
        };

        return handler;
    },


    resize: function (el, width, height) {
        console.log("tree resized");
    },

    renderValue: function (el, rawData) {
        if (rawData === null) {
            return;
        }

        var self = this;

        // Root of a tree structure
        self.treeData = self.getTreeFromRawData(rawData);

        self.updateTreeView(true);
    },

    updateTreeView: function (useTransition) {
        var self = this;

        var treeRoot = d3.hierarchy(self.treeData)
                        .sum(function (n) {
                            return n.weight;
                        })
                        .sort(function (a, b) {
                            return b.value - a.value;
                        }),
            nodes = self.tree(treeRoot).descendants();

        var offset = { top: self.BORDER_MARGIN, left: self.BORDER_MARGIN };

        nodes.forEach(function(d) {
            // Flip coordinates
            var tmpX = (d.depth * 180) + offset.top;
            d.y = d.x + offset.left;
            d.x = tmpX;
        });

        // NOTE(tfs): Slightly worried this will wipe out all the bubbles circles,
        // in which case there MAY be a performance dip. Worth keeping an eye on.
        var circles = self.g.selectAll("circle")
            .data(nodes, self.constancy);

        var text = self.g.selectAll("text")
            .data(nodes, self.constancy);

        var paths = self.g.selectAll("path")
            .data(nodes.slice(1), self.constancy);

        var rects = self.g.selectAll("rect")
            .data(nodes, self.constancy);

        // Ref: https://stackoverflow.com/questions/38599930/d3-version-4-workaround-for-drag-origin
        var dragHandler = d3.drag()
            .subject(function (n) { return n; })
            // .on("start", self.dragStartHandler(self))
            .on("drag", self.activeDragHandler(self))
            .on("end", self.dragEndHandler(self));

        circles.enter()
            .append("circle")
            .attr("class", "tree-node")
            // .attr("r", self.CIRCLE_RADIUS)
            .attr("opacity", "1.0")
            // .attr("fill", "blue")
            .attr("id", function (d) {
                return "tree-node-" + d.data.id;
            })
            .on("click", self.generateNodeClickHandler(self))
            .on("mouseover", function (d) {
                d3.event.stopPropagation;

                self.raiseNode(self, d.data.id);

                var displayID = !self.sourceD ? "" : self.sourceD.data.id,
                    isRoot = self.isRootNode(d);
                Shiny.onInputChange("topic.active", isRoot ? displayID : d.data.id);
            })
            .on("mouseout", function (d) {
                d3.event.stopPropagation();
                var displayID = !self.sourceD ? "" : self.sourceD.data.id;
                Shiny.onInputChange("topic.active", displayID);
            })
            .call(dragHandler);

        text.enter()
            .append("text")
            .attr("class", "tree-label")
            .attr("id", function (d) {
                return "tree-label-" + d.data.id;
            });


        paths.enter()
            .append("path")
            .attr("class", "tree-link")
            .attr("id", function (d) {
                return "tree-path-" + d.data.id;
            });


        rects.enter()
            .append("rect")
            .attr("class", "tree-label-background")
            .attr("id", function (d) {
                return "tree-label-background-" + d.data.id;
            });


        circles.exit().remove();
        text.exit().remove();
        paths.exit().remove();
        rects.exit().remove();

        self.raiseAllLabels();
        self.raiseAllCircles();

        self.resizeAndReposition(useTransition);

        // Sorts display order so that paths are below circles
        // Ref: https://stackoverflow.com/questions/28243431/how-can-i-make-an-svg-circle-always-appear-above-my-graph-line-path
        // self.g.selectAll("circle, path").sort(function (left, right) {
        //     if (left.type === right.type) {
        //         return 0;
        //     } else {
        //         return left.type === "circle" ? -1 : 1;
        //     }
        // });
    },


    // Returns a callback function, setting drag status to ``status``
    dragStatusSetter: function (status) {
        var setterCallback = function (n) {
            // exportable = n;
            var nodeID = ["#tree-node", n.data.id].join("-");
            d3.select(nodeID).classed("dragged-node", status);
            var labelID = ["#tree-label", n.data.id].join("-");
            d3.select(labelID).classed("dragged-label", status);
            var pathID = ["#tree-path", n.data.id].join("-");
            d3.select(pathID).classed("dragged-path", status);

            if (!n.hasOwnProperty("children")) { return; }

            n.children.forEach(function (ch) {
                setterCallback(ch);
            });
        }

        return setterCallback;
    },


    // Pass in reference to "self", as the call() method passes a different "this"
    dragStartHandler: function (selfRef) {
        var handler = function (d) {
            d3.event.sourceEvent.stopPropagation();

            // var nodeID = ["#node", d.data.id].join("-");

            d3.select(this).data().forEach(selfRef.dragStatusSetter(true));

            selfRef.draggedNode = d.data.id;
            // selfRef.dragSourceX = d3.select(this).attr("cx");
            // selfRef.dragSourceY = d3.select(this).attr("cy");
            // console.log(d);

            var coords = d3.mouse(this);

            selfRef.dragPointer = selfRef.g.append("circle").attr("id", "drag-pointer").attr("r", 10).raise();
            d3.select("#drag-pointer").attr("cx", coords[0]).attr("cy", coords[1]);
        }

        return handler;
    },


    // Pass in reference to "self", as the call() method passes a different "this"
    activeDragHandler: function (selfRef) {
        var handler = function (d) {
            coords = d3.mouse(this);

            if (selfRef.isRootNode(d)) { return; }

            if (selfRef.draggedNode === null) {
                d3.event.sourceEvent.stopPropagation();

                var nodeID = ["#tree-node", d.data.id].join("-");

                d3.select(nodeID).data().forEach(selfRef.dragStatusSetter(true));

                selfRef.draggedNode = d.data.id;

                console.log("Started dragging:", d.data.id);

                // selfRef.dragSourceX = d3.select(this).attr("cx");
                // selfRef.dragSourceY = d3.select(this).attr("cy");
                // console.log(d);

                // var coords = d3.mouse(this);

                selfRef.dragPointer = selfRef.g.append("circle").attr("id", "drag-pointer").attr("r", 10).raise();
                d3.select("#drag-pointer").attr("cx", coords[0]).attr("cy", coords[1]);
            }

            // console.log(d3.mouse(this), d3.event.x, d3.event.y, d3.event.sourceEvent.x, d3.event.sourceEvent.y);
            d3.event.sourceEvent.stopPropagation();

            // d3.select(this).attr("cx", n.x).attr("cy", n.y);
            d3.select("#drag-pointer").attr("cx", coords[0]).attr("cy", coords[1])

            // var labelID = ["#label", this.id.split("-")[1]].join("-");

            // d3.select(labelID).attr("transform", "translate("+n.x+","+n.y+")");
        }

        return handler;
    },

    // Pass in reference to "self", as the call() method passes a different "this"
    dragEndHandler: function (selfRef) {
        var handler = function (d) {
            if (selfRef.draggedNode === null) { return; }
            
            d3.select("#drag-pointer").remove();
            d3.event.sourceEvent.stopPropagation();

            // Calculate values for moving/merging nodes
            var pageX = d3.event.sourceEvent.pageX;
            var pageY = d3.event.sourceEvent.pageY;
            var sourceID = selfRef.draggedNode;
            var target = d3.select(document.elementFromPoint(pageX, pageY)).data()[0];

            d3.select(this).data().forEach(selfRef.dragStatusSetter(false));

            selfRef.draggedNode = null;

            // Move or merge if applicable, AFTER having reset draggedNode/etc.
            if (target) {
                if (selfRef.isLeafNode(target)) {
                    var targetID = target.parent.data.id;
                } else {
                    var targetID = target.data.id;
                }

                var makeNewGroup = d3.event.sourceEvent.shiftKey;
                var updateNeeded = selfRef.moveOrMerge(selfRef, sourceID, targetID, makeNewGroup);
                
                if (updateNeeded) {
                    selfRef.updateTopicAssignments(selfRef, function() {
                        self.updateView(true);
                    });
                }
            }
        }

        return handler;
    },


    // NOTE(tfs): There must be a cleaner way of appraoching this
    raiseNode: function (selfRef, nodeID) {
        var rootElemNode = $("#tree-root")[0];
        rootElemNode.appendChild($("#tree-node-"+nodeID)[0]);
    },


    raiseLabel: function (selfRef, nodeID) {
        var rootElemNode = $("#tree-root")[0];
        rootElemNode.appendChild($("#tree-label-background-"+nodeID)[0]);
        rootElemNode.appendChild($("#tree-label-"+nodeID)[0]);
    },


    raiseAllCircles: function () {
        var self = this,
            rootElemNode = $("#tree-root")[0];

        self.traverseTree(self.treeData, function (n) {
            var id = n.id;
            self.raiseNode(self, id);
        });
    },


    raiseAllLabels: function () {
        var self = this,
            rootElemNode = $("#tree-root")[0];

        self.traverseTree(self.treeData, function (n) {
            var id = n.id;
            self.raiseLabel(self, id);
        });
    },


    /* Move or merge source node with target node.
     */
    moveOrMerge: function (selfRef, sourceID, targetID, makeNewGroup) {
        var sourceD = d3.select("#tree-node-"+sourceID).data()[0],
            targetD = d3.select("#tree-node-"+targetID).data()[0],
            sourceIsLeaf = selfRef.isLeafNode(sourceD),
            targetIsSource = sourceD.data.id === targetD.data.id,
            mergingNodes = sourceD.children && sourceD.children.length > 1,
            sameParentSel = sourceD.parent === targetD,
            oldParentD,
            nsToMove;

        if (targetIsSource || (sameParentSel && !makeNewGroup)) {
            return false;
        }

        if (makeNewGroup) {
            oldParentD = sourceD.parent;
            selfRef.createNewGroup(targetD, sourceD);
            selfRef.removeChildDFromParent(sourceD);

            // Any or all of the source's ancestors might be childless now.
            // Walk up the tree and remove childless nodes.
            selfRef.removeChildlessNodes(oldParentD);

            return true;
        } else {
            if (sourceIsLeaf) {
                nsToMove = [sourceD.data];
                oldParentD = sourceD.parent;
            } else {
                nsToMove = [];
                sourceD.children.forEach(function (d) {
                    nsToMove.push(d.data);
                });
                oldParentD = sourceD;
            }

            selfRef.updateNsToMove(selfRef, nsToMove, oldParentD, targetD);
            if (sourceIsLeaf) {
                selfRef.removeChildlessNodes(oldParentD);
            } else {
                selfRef.removeChildDFromParent(sourceD);
            }

            return true;
        }
    },


    resizeAndReposition: function (useTransition = false) {
        var self = this,
            circles = self.g.selectAll("circle"),
            paths = self.g.selectAll("path"),
            text = self.g.selectAll("text"),
            rects = self.g.selectAll("rect"),
            MOVE_DURATION = 500;

        if (useTransition) {
            circles = circles.transition().duration(MOVE_DURATION);
            paths = paths.transition().duration(MOVE_DURATION);
            text = text.transition().duration(MOVE_DURATION);
            rects = rects.transition().duration(MOVE_DURATION);
        }

        // text.attr("transform", function (d) {
        //         var x = (d.x),
        //             y = (d.y);
        //         // return "translate(" + (x + offset.left) + "," + (y + offset.top) + ")";
        //         return "translate(" + x + "," + y + ")";
        //     })

        // text.selectAll("tspan")
        //     .attr("y", function () {
        //         var that = d3.select(this),
        //             i = +that.attr("data-term-index"),
        //             len = +that.attr("data-term-len");
        //         // `- (len / 2) + 0.75` shifts the term down appropriately.
        //         // `15 * k` spaces them out appropriately.
        //         return (self.FONT_SIZE * (k / 2) + 3) * 1.2 * (i - (len / 2) + 0.75);
        //     })
        //     .style("font-size", function () {
        //         return (self.FONT_SIZE * (k / 2) + 3) + "px";
        //     });

        paths.attr("d", function (d) {
                // exportable = d;
                // var source = {x: d.source.x - self.edgeWidthMap(self.findEdgeSource(d)), y: d.source.y};
                // var target = {x: d.target.x, y: d.target.y};
                return self.shapePath(d, d.parent);
            })
            .attr("stroke-width", function (d) {
                // exportable = self;
                // return self.edgeWidthMap(d.data.weight / d.parent.data.weight);
                return self.edgeWidthMap(d.data.weight);
            })
            .attr("fill", "none")
            .attr("stroke", "black");

        circles.attr("cx", function (d) {
                return d.x;
            })
            .attr("cy", function (d) {
                return d.y;
            })
            .attr("depth", function (d) {
                return d.depth;
            })
            .each(function (d) {
                var elem = d3.select(this);

                if (d.data.collapsed) {
                    // NOTE(tfs): Might be re-adding this class to some nodes
                    elem.classed("middle-tree-node", false);
                    elem.classed("collapsed-tree-node", true);
                    elem.classed("terminal-tree-node", false);
                    elem.attr("r", self.COLLAPSED_NODE_RADIUS);
                } else if (d.data.children && d.data.children.length > 0) {
                    // NOTE(tfs): There is probably a cleaner way to do this
                    elem.classed("middle-tree-node", true);
                    elem.classed("terminal-tree-node", false);
                    elem.classed("collapsed-tree-node", false);
                    elem.attr("r", self.CIRCLE_RADIUS);
                } else {
                    elem.classed("middle-tree-node", false);
                    elem.classed("terminal-tree-node", true);
                    elem.classed("collapsed-tree-node", false);
                    elem.attr("r", self.TERMINAL_NODE_RADIUS);
                }
            });

        text.attr("x", function (d) {
                var margin = 2 + (d3.select("#tree-node-" + d.data.id).classed("termional-tree-node") ? self.TERMINAL_NODE_RADIUS : self.COLLAPSED_NODE_RADIUS);
                return d.x + margin;
            })
            .attr("y", function (d) {
                // var halfHeight = $("#tree-label-" + d.data.id)[0].getBBox().height / 2;
                return d.y + self.TEXT_HEIGHT_OFFSET;
            })
            .each(function (d) {
                var sel = d3.select(this);

                sel.selectAll("*").remove();

                if (!d.data.terms) {
                    return;
                }

                // if (!d.data.collapsed || !d.data.children || d.data.children <= 0) {
                //     return;
                // }

                if (true || d.data.collapsed || d3.select("#tree-node-"+d.data.id).classed("terminal-tree-node")) {
                    var len = d.data.terms.length;

                    sel.append("tspan")
                        .text(d.data.terms.join(" "))
                        .attr("font-size", self.FONT_SIZE);
                }
            });

        rects.attr("x", function (d) {
                var margin = 2 + (d3.select("#tree-node-" + d.data.id).classed("terminal-tree-node") ? self.TERMINAL_NODE_RADIUS : self.COLLAPSED_NODE_RADIUS);
                return d.x + margin;
            })
            .attr("y", function (d) {
            var textheight = $("#tree-label-"+d.data.id)[0].getBBox().height;
                // Add 4 to adjust for margins. Probably a better way to calculate this.
                return d.y - textheight + 4;
            })
            .attr("width", function (d) {
                var textwidth = $("#tree-label-"+d.data.id)[0].getBBox().width;
                return textwidth;
            })
            .attr("height", function (d) {
                var textheight = $("#tree-label-"+d.data.id)[0].getBBox().height;
                return textheight;
            })
            .each(function (d) {
                var isTerminal = d3.select("#tree-node-" + d.data.id).classed("terminal-tree-node")
                                || d3.select("#tree-node-" + d.data.id).classed("collapsed-tree-node");
                d3.select(this).classed("hidden-tree-label-background", isTerminal);
            });
    },











    // Ref: https://bl.ocks.org/d3noob/43a860bc0024792f8803bba8ca0d5ecd
    shapePath: function (s, t) {

        // TODO(tfs): Copied from Ref for now
        var path = `M ${s.x} ${s.y}
                    C ${(s.x + t.x) / 2} ${s.y},
                      ${(s.x + t.x) / 2} ${t.y},
                      ${t.x} ${t.y}`


        return path;
    },


    setNodeDisplayStatus: function (d, status) {
        var self = this,
            id = d.id;
        d3.select("#tree-node-"+id).classed("hidden-tree-node", status);
        d3.select("#tree-path-"+id).classed("hidden-tree-path", status);
        d3.select("#tree-label-"+id).classed("hidden-tree-label", status);
        d3.select("#tree-label-background-"+id).classed("hidden-tree-label-background", status);

        if (d.children && d.children.length > 0 && !d.collapsed) {
            d.children.forEach(function (newD) {
                self.setNodeDisplayStatus(newD, status);
            });
        }
    },


    // Ref: https://bl.ocks.org/d3noob/43a860bc0024792f8803bba8ca0d5ecd
    collapseNode: function (n) {
        var self = this;
        var d = n.data;

        // if (d.children && d.children.length > 0) {
        //     d.childStore = d.children;
        //     d.children = [];
        //     d.collapsed = true;
        // }

        if (d.children && d.children.length > 0) {
            d.collapsed = true;
            // self.traverseTree(d, function (node) {
            //     if (node.id !== d.id) { self.setNodeDisplayStatus(node.id, true); }
            // });
            // self.setNodeDisplayStatus(d, true);
            d.children.forEach(function (child) {
                self.setNodeDisplayStatus(child, true);
            });
        }

        d3.select("#tree-node-" + d.id).classed("collapsed-tree-node", true);
        d3.select("#tree-label-" + d.id).classed("collapsed-tree-label", true);
    },


    expandNode: function (n) {
        var self = this;
        var d = n.data;

        // if (d.childStore && d.childStore.length > 0) {
        //     d.children = d.childStore;
        //     d.childStore = null;
        //     d.collapsed = false;
        // }

        if (d.collapsed) {
            d.collapsed = false;
            // self.traverseTree(d, function (node) {
            //     if (node.id !== d.id) { self.setNodeDisplayStatus(node.id, false); }
            // });

            // self.setNodeDisplayStatus(d, false);
            d.children.forEach(function (child) {
                self.setNodeDisplayStatus(child, false);
            });
        }

        d3.select("#tree-node-" + d.id).classed("collapsed-tree-node", false);
        d3.select("#tree-label-" + d.id).classed("collapsed-tree-label", false);
    },


    generateNodeClickHandler: function (selfRef) {
        var treeNodeClickHandler = function (n) {
            console.log(d3.event);
            d3.event.stopPropagation();

            // Handle Windows and Mac common behaviors
            if (d3.event.ctrlKey || d3.event.altKey) {
                // NOTE(tfs): I think this avoids wierdness with javascript nulls
                if (n.data.collapsed === true) {
                    selfRef.expandNode(n);
                } else {
                    selfRef.collapseNode(n);
                }

                console.log(n);

                selfRef.updateTreeView(true);
            } else {
                selfRef.selectNode(n, false);
            }
        }

        return treeNodeClickHandler;
    },

    // From: http://bl.ocks.org/shubhgo/80323b7f3881f874c02f
    // findEdgeSource: function (link) {
    //     var targetID = link.target.id;

    //     var numChildren = link.source.children.length;
    //     var widthAbove = 0;

    //     for (var i = 0; i < numChildren; i++) {
    //         if (link.source.children[i].id == targetID) {
    //             widthAbove = widthAbove + link.source.children[i].size/2;
    //             break;
    //         } else {
    //             widthAbove = widthAbove + link.source.children[i].size;
    //         }
    //     }

    //     return link.source.size/2 - widthAbove;
    // },

    updateNsToMove: function (selfRef, nsToMove, oldParentD, newParentD) {
        var newChildren = [];

        // Remove nodes-to-move from old parent.
        if (nsToMove.length === 1) {
            oldParentD.data.children.forEach(function (child) {
                if (child.id !== nsToMove[0].id) {
                    newChildren.push(child);
                }
            });
            oldParentD.data.children = newChildren;
        } else {
            // In this scenario, the user selected a group of topics
            // (`oldParent`), and we're moving all of that group's children.
            oldParentD.data.children = [];
        }

        // Add nodes-to-move to new parent.
        nsToMove.forEach(function (nToMove) {
            newParentD.data.children.push(nToMove);
        });
    },

    /* Removes child node from its parent.
     */
    removeChildDFromParent: function (childD) {
        var newChildren = [];
        childD.parent.data.children.forEach(function (n) {
            if (n.id !== childD.data.id) {
                newChildren.push(n);
            }
        });
        childD.parent.data.children = newChildren;
    },

    /* Make new group with `target` if node meets criteria.
     */
    createNewGroup: function (newGroupD, childD) {
        var self = this;
        newGroupD.data.children.push({
            id: self.getNewID(),
            children: [childD.data],
            terms: childD.data.terms
        });
    },

    traverseTree: function (node, processNode) {
        var self = this;
        processNode(node);
        if (typeof node.children !== "undefined") {
            node.children.forEach(function (childNode) {
                self.traverseTree(childNode, processNode)
            });
        }
    },

    /* Convert R dataframe to tree.
     */
    getTreeFromRawData: function (x) {
        var self = this,
            data = { id: 0, children: [], terms: [], weight: 0 },
            srcData = HTMLWidgets.dataframeToD3(x.data);

        // Sort srcData by node ID
        srcData.sort(function(left, right) {
            if (left.nodeID < right.nodeID) {
                return -1;
            } else if (left.nodeID > right.nodeID) {
                return 1;
            }

            return 0;
        });

        // Assumes no broken connections, but does NOT assume that there are no empty IDs
        var maxID = srcData[srcData.length-1].nodeID;

        // NOTE(tfs): I'm not entirely sure how references work in JS. This could break horribly
        // NOTE(tfs): When assigning to index out of bounds, JS arrays expand and include undefined entries.
        var nodes = [];
        nodes[0] = data;
        for (var i = 0; i < srcData.length; i++) {
            nodes[srcData[i].nodeID] = { id: srcData[i].nodeID, children: [], terms: [], weight: 0 };
        }

        var rawPoint;
        var cleanPoint;
        var parent;
        var maxWeight = 0;

        for (var i = 0; i < srcData.length; i++) {
            rawPoint = srcData[i];
            cleanPoint = nodes[rawPoint.nodeID];
            parent = nodes[rawPoint.parentID];

            if (rawPoint.weight === 0) {
                parent.children.push(cleanPoint);
                cleanPoint.terms = rawPoint.title.split(" ");
            } else if (parent !== null && parent.hasOwnProperty("children")) {
                parent.children.push(cleanPoint);
                cleanPoint.terms = rawPoint.title.split(" ");
                cleanPoint.weight = rawPoint.weight;
            }
        }

        // Updates weight properties of nodes
        self.maxNodeWeight = self.findAndSetWeightRecursive(self, data);
        self.edgeWidthMap = d3.scaleLinear()
                                .domain([0, self.maxNodeWeight])
                                .range([self.MIN_EDGE_WIDTH, self.MAX_EDGE_WIDTH]);

        // For each data row add to the output tree.
        // srcData.forEach(function (d) {
        //     var parent = self.findParent(data, d.parentID, d.nodeID);

        //     // Leaf node.
        //     if (d.weight === 0) {
        //         parent.children.push({
        //             id: d.nodeID,
        //             terms: d.title.split(" "),
        //             children: []
        //         });
        //     } else if (parent !== null && parent.hasOwnProperty("children")) {
        //         parent.children.push({
        //             id: d.nodeID,
        //             terms: d.title.split(" "),
        //             weight: d.weight
        //         });
        //     }
        // });



        return data;
    },


    // Updates weight properties of nodes in addition to returning weight values
    findAndSetWeightRecursive: function (selfRef, treeNode) {
        if (treeNode.children && treeNode.children.length > 0) {
            var wgt = 0;

            treeNode.children.forEach(function (d) {
                wgt += selfRef.findAndSetWeightRecursive(selfRef, d);
            });

            treeNode.weight = wgt;
            return wgt;
        } else {
            return treeNode.weight;
        }
    },

    /* Update the string that informs the Shiny server about the hierarchy of
     * topic assignments
     */
    updateTopicAssignments: function (selfRef, callback) {
        var self = selfRef,
            assignments = [],
            EVENT = "topics";
        self.traverseTree(self.treeData, function (n) {
            if (!n.children) {
                return;
            }
            if (n.weight <= 0 && n.children.length === 0) {
                return;
            }

            if (n.children && n.children.length > 0) {
                n.children.forEach(function (childN) {
                    assignments.push(childN.id + ":" + n.id);
                });
            } else if (n.childStore && n.childStore.length > 0) {
                n.childStore.forEach(function (childN) {
                    assignments.push(childN.id + ":" + n.id);
                });
            }
        });
        Shiny.addCustomMessageHandler(EVENT, function (newTopics) {
            self.updateTopicView(newTopics);
            callback();
        });
        Shiny.onInputChange(EVENT, assignments.join(","));
    },

    updateTopicView: function (newTopics) {
        var self = this;
        self.traverseTree(self.treeData, function (n) {
            var terms = newTopics[n.id];
            if (terms) {
                n.terms = terms.split(' ');
            }
        });
    },

    /* Helper function to add hierarchical structure to data.
        TODO(tfs): Make this more efficient, usable for in-order (or any-order) assignments
     */
    findParent: function (branch, parentID, nodeID) {
        var self = this,
            rv = null;
        if (branch.id === parentID) {
            rv = branch;
        } else if (rv === null && branch.children !== undefined) {
            branch.children.forEach(function (child) {
                if (rv === null) {
                    rv = self.findParent(child, parentID, nodeID);
                }
            });
        }
        return rv;
    },

    /* Finds the maximum node ID and returns the next integer.
     */
    getNewID: function () {
        var self = this,
            maxID = 0;
        self.traverseTree(self.treeData, function (n) {
            if (n.id > maxID) {
                maxID = n.id;
            }
        });
        return maxID + 1;
    },

    /* Returns `true` if the node is the root node, `false` otherwise.
     */
    isRootNode: function (d) {
        return d.data.id === 0;
    },

    /* Returns `true` if the node is a leaf node, `false` otherwise.
     */
    isLeafNode: function (d) {
        var hasChildren = typeof d.data.children !== 'undefined';
        if (hasChildren) {
            return d.data.children.length === 0;
        } else {
            return true;
        }
    },

    /* Returns true if node `a` is a child node of `b`.
     */
    aIsChildOfB: function (aD, bD) {
        var result = false;
        if (bD && bD.data.children && bD.data.children.length > 0) {
            bD.children.forEach(function (d) {
                if (d.data.id === aD.data.id) {
                    result = true;
                }
            });
        }
        return result;
    },

    /* Returns `true` if the node is both in focus and a group rather than a
     * leaf.
     */
    isGroupInFocus: function (d) {
        var self = this,
            isInFocus = d === self.nodeInFocus,
            isGroup = !self.isLeafNode(d);
        return isInFocus && isGroup;
    },

    /* This is a critical function. We need to give D3 permanent IDs for each
     * node so that it knows which data goes with which bubble. See:
     * https://bost.ocks.org/mike/constancy/
     */
    constancy: function (d) {
        return d.data.id;
    },

    /* Walks the tree data and moves each node after its parent.
     */
    sortNodesBasedOnTree: function () {
        var self = this,
            childNode,
            parentNode;

        function insertAfter(newNode, referenceNode) {
            referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
        }

        self.traverseTree(self.treeData, function (n) {
            if (n.children) {
                n.children.forEach(function (child) {
                    childNode = document.getElementById('node-' + child.id);
                    parentNode = document.getElementById('node-' + n.id);
                    insertAfter(childNode, parentNode);

                    childNode = document.getElementById('label-' + child.id);
                    parentNode = document.getElementById('label-' + n.id);
                    insertAfter(childNode, parentNode);
                });
            }
        });
    },

    /* Walks up the tree and removes empty groups, starting with `oldParentD`.
     */
    removeChildlessNodes: function (groupD) {
        var self = this,
            removeGroup;

        removeGroup = !groupD.data.children || groupD.data.children.length === 0;
        if (removeGroup) {
            self.removeChildDFromParent(groupD);
        }
        // Walk up the tree. In principle, `groupD` could be an only child. In
        // this scenario, we want to remove its parent as well. This recursion
        // should continue so long as each new group is an only child.
        if (groupD.parent) {
            self.removeChildlessNodes(groupD.parent);
        }
    },


    selectNode: function (targetD, makeNewGroup) {
        var self = this,
            sourceExists = !!self.sourceD,
            souceSelectedTwice,
            notReallyAMove,
            targetIsSourceChild;

        if (self.isRootNode(targetD) && !sourceExists) {
            self.setSource(targetD);
        } else if (sourceExists) {
            souceSelectedTwice = self.sourceD === targetD;
            targetIsSourceChild = self.aIsChildOfB(targetD, self.sourceD);
            notReallyAMove = self.isLeafNode(self.sourceD)
                && self.sourceD.parent === targetD
                && !makeNewGroup;
        }

        if (souceSelectedTwice) {
            self.setSource(null);
        } else if (!sourceExists
            || self.isLeafNode(targetD)
            || targetIsSourceChild
            || notReallyAMove) {

            self.setSource(targetD);
        } else {
            // NOTE(tfs): Experimenting with different control schemes
            // self.moveOrMerge(targetD, makeNewGroup);
            // self.updateTopicAssignments(function() {
            //     self.updateView(true);
            // });

            self.setSource(targetD);
        }
    },

    setSource: function (newVal) {
        var self = this,
            oldVal = self.sourceD;
        self.sourceD = newVal;
        if (oldVal) {
            // self.setLabelVisibility(oldVal);
            // self.setCircleFill(oldVal);
        }
        if (newVal) {
            // self.setLabelVisibility(self.sourceD);
            // self.setCircleFill(self.sourceD);
            Shiny.onInputChange("topic.selected", self.sourceD.data.id);
            Shiny.onInputChange("topic.active", self.sourceD.data.id);
        } else {
            Shiny.onInputChange("topic.selected", "");
            // Shiny.onInputChange("topic.active", ""); // TODO(tfs): Once hover is enabled on the tree, remove this
        }
    },


})


