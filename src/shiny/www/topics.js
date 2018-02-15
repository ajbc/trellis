var TOPIC_LABEL = "Topic";
var DOCUMENT_LABEL = "Document";
var TREE_LABEL = "Tree";
var BUBBLE_LABEL = "Bubbles";

var showingHelp = false; // This is probably just terrible AND not needed
var selectedView = BUBBLE_LABEL;
var selectedViewTab
var selectedLeftTab = DOCUMENT_LABEL;
var data = null;
var exportMode = false;
var LEFT_BAR_WIDTH = 300;
var activeWidget;
var activeSelector;

var assignments;

// NOTE(tfs): These aren't actually set correctly at all. HTMLWidgets.widgets
//            does not give the actual instance we care about.
var bubbleWidget;
var treeWidget;
var widgets = {};

var BUBBLE_SELECTOR = "svg#bubbles-svg";
var TREE_SELECTOR = "svg#tree-svg";

var selectors = {};

var selectedNodeID = -1;

var assignments = "";

var exportable = {}; // TODO(tfs): Remove this when done debugging


$(document).ready(function() {
	// Leave a little buffer for max width
	$("#main-panel").css({ "max-width": ($(window).width() - (LEFT_BAR_WIDTH + 5)) + "px"});
	$("#document-details-content").css({ "max-width": ($(window).width() - (LEFT_BAR_WIDTH + 5)) + "px"});
	$(window).resize(function(event) {
		if (!exportMode) {
			$("#main-panel").css({ "max-width": ($(window).width() - (LEFT_BAR_WIDTH + 5)) + "px"});
			$("#document-details-content").css({ "max-width": ($(window).width() - (LEFT_BAR_WIDTH + 5)) + "px"});
			$("#doctab-document-container").css({ "height": ($(window).height() - $("#doctab-document-container").position().top) });
		}
	});

	$("#help-button").click(function(event) {
		event.preventDefault();
		toggleHelpButton();
	});

	$("#bubbles-selector").click(function(event) {
		event.preventDefault();
		selectBubbles();
	});

	$("#tree-selector").click(function(event) {
		event.preventDefault();
		selectTree();
	});

	$("#left-bar-topic-tab").click(function(event) {
		event.preventDefault();
		selectTopicTab();
	});

	$("#left-bar-document-tab").click(function(event) {
		event.preventDefault();
		selectDocumentTab();
	});

	// $("#export-cancel-button").click(function(event) {
	// 	event.preventDefault();
	// 	Shiny.onInputChange("toggleExportMode")
	// });

	$("#export-svg-button").click(function(event) {
		event.preventDefault();
		downloadActiveWidgetAsSVG();
	});

	$("#updateTitle").click(function(event) {
		event.preventDefault();
		cleanTopicInputs();
	});


	$("#document-details-offset").click(hideDocumentDetails);
});


$(document).on("shiny:sessioninitialized", function(event) {
	Shiny.onInputChange("topics", "");
	Shiny.onInputChange("topic.active", "");
	Shiny.onInputChange("topic.selected", "");

	Shiny.addCustomMessageHandler("processingFile", processInputFile);

	Shiny.addCustomMessageHandler("initializeMainView", initializeMainView);

	Shiny.addCustomMessageHandler("topicSelected", handleTopicSelection);

	Shiny.addCustomMessageHandler("enterExportMode", enterExportMode);
	Shiny.addCustomMessageHandler("exitExportMode", exitExportMode);

	Shiny.addCustomMessageHandler("runtimeCluster", handleRuntimeCluster);
	Shiny.addCustomMessageHandler("runtimeClusterError", handleRuntimeClusterError);

	Shiny.addCustomMessageHandler("nodeDeleted", handleNodeDeletion);

	for (var i = 0; i < HTMLWidgets.widgets.length; i++) {
		switch (HTMLWidgets.widgets[i].name) {
			case "topicBubbles":
				bubbleWidget = HTMLWidgets.widgets[i];
				break;
		}
	}

	treeWidget = { resize: function (el, w, h) { console.log(el, w, h); } };

	widgets[BUBBLE_LABEL] = bubbleWidget;
	widgets[TREE_LABEL] = treeWidget;

	selectors[BUBBLE_LABEL] = BUBBLE_SELECTOR;
	selectors[TREE_LABEL] = TREE_SELECTOR;

	activeWidget = widgets[BUBBLE_LABEL];

	// This is probably a terrible way of selecting the appropriate svg element
	activeSelector = selectors[BUBBLE_LABEL];
	Shiny.onInputChange("selectedView", BUBBLE_LABEL);
});


function processInputFile(msg) {
	$("#topic\\.start").attr("disabled", true);
	$("#init-message").removeClass("inplace-hidden-message");
	$("#init-message").trigger("shown");
}


// function handleInitialAssignments(msg) {
// 	var assigns = [];

// 	// "child:parent,child:parent,child:parent..."
// 	for (var i = 0; i < msg.length; i++) {
// 		var newAssign = i + ":" + msg[i];
// 		assigns.push(newAssign);
// 	}

// 	assignments = assigns.join(",");

// 	Shiny.onInputChange("topics", assignments)
// }


function updateData(dataObject) {
	data = dataObject;
};


function initializeMainView(msg) {
	console.log("hi");
	$("#doctab-document-container").css({ "height": ($(window).height() - $("#doctab-document-container").position().top) });
}


function toggleHelpButton() {
	var helpbox = $("#help-box");
	if (helpbox.hasClass("hidden-popup")) {
		helpbox.removeClass("hidden-popup");
		showingHelp = true;
		helpbox.trigger("shown");
	} else {
		helpbox.addClass("hidden-popup");
		showingHelp = false;
		helpbox.trigger("hidden");
	}
};


// NOTE(tfs): When hiding or showing an element that contains rendered Shiny output,
//            triggering jQuery "shown" and "hidden" events notifies Shiny to update/
//            render the content. Otherwise, the content is not updated while
//            "display: none;" is set. Alternately, set "suspendWhenHidden=FALSE"
//            using outputOptions on the R side.
//            Ref: https://groups.google.com/forum/#!topic/shiny-discuss/yxFuGgDOIuM
function selectBubbles() {
	if (selectedView === BUBBLE_LABEL) {
		return;
	}

	selectedView = BUBBLE_LABEL;
	
	$("#bubbles-selector").addClass("selected-view-button");
	$("#tree-selector").removeClass("selected-view-button");
	
	$("#bubbles-view").trigger("show");
	$("#bubbles-view").removeClass("hidden-view");
	$("#bubbles-view").trigger("shown");

	$("#tree-view").trigger("hide");
	$("#tree-view").addClass("hidden-view");
	$("#tree-view").trigger("hidden");
	
	$("#bubbles-selector").attr("disabled", "disabled");
	$("#tree-selector").removeAttr("disabled");
	
	activeWidget = widgets[BUBBLE_LABEL];
	activeSelector = selectors[BUBBLE_LABEL];
	Shiny.onInputChange("selectedView", BUBBLE_LABEL);
};


function selectTree() {
	if (selectedView === TREE_LABEL) {
		return;
	}

	selectedView = TREE_LABEL;
	
	$("#tree-selector").addClass("selected-view-button");
	$("#bubbles-selector").removeClass("selected-view-button");
	
	$("#tree-view").trigger("show");
	$("#tree-view").removeClass("hidden-view");
	$("#tree-view").trigger("shown");
	
	$("#bubbles-view").trigger("hide");
	$("#bubbles-view").addClass("hidden-view");
	$("#bubbles-view").trigger("hidden");
	
	$("#tree-selector").attr("disabled", "disabled");
	$("#bubbles-selector").removeAttr("disabled");
	
	activeWidget = widgets[TREE_LABEL];
	activeSelector = selectors[TREE_LABEL];
	Shiny.onInputChange("selectedView", TREE_LABEL);
};


function selectTopicTab() {
	if (selectedLeftTab === TOPIC_LABEL) {
		return;
	}

	selectedLeftTab = TOPIC_LABEL;

	$("#left-bar-topic-tab").addClass("active-left-bar-tab");
	$("#left-bar-document-tab").removeClass("active-left-bar-tab");

	$("#left-bar-topic-content").trigger("show");
	$("#left-bar-topic-content").removeClass("hidden-left-bar-content");
	$("#left-bar-topic-content").trigger("shown");

	$("#left-bar-document-content").trigger("hide");
	$("#left-bar-document-content").addClass("hidden-left-bar-content");
	$("#left-bar-document-content").trigger("hidden");
};


function selectDocumentTab() {
	if (selectedLeftTab === DOCUMENT_LABEL) {
		return;
	}

	selectedLeftTab = DOCUMENT_LABEL;
	
	$("#left-bar-document-tab").addClass("active-left-bar-tab");
	$("#left-bar-topic-tab").removeClass("active-left-bar-tab");
	
	$("#left-bar-document-content").trigger("show");
	$("#left-bar-document-content").removeClass("hidden-left-bar-content");
	$("#left-bar-document-content").trigger("shown");
	
	$("#left-bar-topic-content").trigger("hide");
	$("#left-bar-topic-content").addClass("hidden-left-bar-content");
	$("#left-bar-topic-content").trigger("hidden");
};


function initializeData(initData) {
	data = initData;
	console.log(initData);
};


function enterExportMode(msg) {
	if (exportMode) {
		return;
	} else {
		$("#left-bar").addClass("left-content-export-mode");
		$("#export-button-container").addClass("hidden");
		$(".export-mode-control").removeClass("hidden");
		// $("#main-panel").addClass("main-content-export-mode");
		exportMode = true;
		$("#main-panel").css({ "max-width": "unset" });
		$("#main-panel").animate({ "width": "100vw" }, 500, function() {
			// $("#main-panel").addClass("main-content-export-mode");
			// bubbleWidget.resize();
			$(window).trigger("resize"); // Not the cleanest solution, but seems to work
		});
	}
}


function exitExportMode(msg) {
	if (exportMode) {
		$("#left-bar").removeClass("left-content-export-mode");
		$("#export-button-container").removeClass("hidden");
		$(".export-mode-control").addClass("hidden");
		// $("#main-panel").removeClass("main-content-export-mode");
		exportMode = false;
		var newWidth = Math.min($(window).width() - (LEFT_BAR_WIDTH + 5), 0.7 * $(window).width());
		$("#main-panel").animate({ "width": newWidth }, 500, function() {
			// $("#main-panel").removeClass("main-content-export-mode");
			$("#main-panel").css({ "max-width": ($(window).width() - (LEFT_BAR_WIDTH + 5)) + "px"});
			$("#main-panel").css({ "width": "70vw" });
			// widgets[selectedView].resize($(""));
			$(window).trigger("resize");
		});
	} else {
		return;
	}
}


// TODO(tfs): Include styling: https://stackoverflow.com/questions/15181452/how-to-save-export-inline-svg-styled-with-css-from-browser-to-image-file
function downloadActiveWidgetAsSVG() {
	// Should probably be using 'let', but I don't think it's been fully adopted yet
	var serializer = new XMLSerializer();
	var sourceString = serializer.serializeToString($(activeSelector)[0]);

	// Ref: https://stackoverflow.com/questions/2483919/how-to-save-svg-canvas-to-local-filesystem
	$("body").append("<a id=\"tmp-download-link\" class=\"hidden\"></a>");
	$("#tmp-download-link").attr("href", "data:image/svg+xml;utf8," + sourceString)
			.attr("download", selectedView + ".svg")
			.attr("target", "_blank");
	$("#tmp-download-link")[0].click();
	$("a#tmp-download-link").remove();

	// Shiny.onInputChange("svgString", sourceString);
}


function handleTopicSelection(selectedID) {
	var needsCleaning = (selectedID !== selectedNodeID);

	selectedNodeID = selectedID;

	if (selectedID !== "") {
		activateTopicTabInputs(needsCleaning);
	} else {
		deactivateTopicTabInputs();
	}
}


function activateTopicTabInputs(needsCleaning) {
	// if (selectedLeftTab !== TOPIC_LABEL) { return; }

	if (needsCleaning) {
		cleanTopicInputs();
	}

	$("#topic-controls-inputs-container").trigger("show");
	$("#topic-controls-inputs-container").removeClass("hidden");
	$("#topic-controls-inputs-container").trigger("shown");
}


function deactivateTopicTabInputs() {
	// if (selectedLeftTab !== TOPIC_LABEL) { return; }

	cleanTopicInputs();

	$("#topic-controls-inputs-container").trigger("hide");
	$("#topic-controls-inputs-container").addClass("hidden");
	$("#topic-controls-inputs-container").trigger("hidden");
}


function clickDocumentSummary(docID) {
	console.log("yo?");
	// cleanDocumentDetails();
	Shiny.onInputChange("document.details.docid", docID);
	displayDocumentDetails();
}


function cleanDocumentDetails() {
	$("#document-details-content").html("");
}


function displayDocumentDetails() {
	$("#document-details-container").trigger("show");
	$("#document-details-container").removeClass("hidden");
	$("#document-details-container").trigger("shown");
}


function hideDocumentDetails() {
	$("#document-details-container").trigger("hide");
	$("#document-details-container").addClass("hidden");
	$("#document-details-container").trigger("hidden");
}


function cleanTopicInputs() {
	// NOTE(tfs): Apparently using jquery to set val()
	//            doesn't trigger an update to the input field for Shiny

	$("#topic\\.customTitle").val("");
	Shiny.onInputChange("topic.customTitle", "")

	var defNumClusters = parseInt($("#runtime\\.numClusters").attr("data-shinyjs-resettable-value"))
	$("#runtime\\.numClusters").val(defNumClusters);
	Shiny.onInputChange("runtime.numClusters", defNumClusters)
}


function handleRuntimeCluster(msg) {
	Shiny.onInputChange("topic.selected", "");
	exportable.msg = msg;
}


function handleRuntimeClusterError(err) {
	console.log(err);
}


function handleNodeDeletion(msg) {
	console.log(msg);
	Shiny.onInputChange("topic.selected", "");
	cleanTopicInputs();
}


// Shiny.addCustomMessageHandler("initialized", function(msg) {
	// alert(msg);
	// $(".initial").hide();
	// $(".initial").css("visibility", "hidden");
	// $("#left-content").css("visibility", "visible");
	// $("#main-content").css("visibility", "visible");
	// $(".initial").addClass("shinyjs-hide");
	// $("#left-content").removeClass("shinyjs-hide");
	// $("#main-content").removeClass("shinyjs-hide");
	// $("#left-content").css("visibility", "visible");
	// $("#main-content").css("visibility", "visible");
	// $("#main-content").show();
	// $("#left-content").show();
// });
