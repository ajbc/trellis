var TOPIC_LABEL     = "Topic";
var DOCUMENT_LABEL  = "Document";
var VOCAB_LABEL     = "Vocab";
var TREE_LABEL      = "Tree";
var BUBBLE_LABEL    = "Bubbles";

var showingHelp     = false; // This is probably not needed
var selectedView    = BUBBLE_LABEL;
var selectedViewTab;
var selectedLeftTab = DOCUMENT_LABEL;
var data            = null;
var exportMode      = false;
var flattenMode     = false;
var LEFT_BAR_WIDTH  = 300;
var RIGHT_BAR_WIDTH = 300;
var activeSelector;

var assignments;

// NOTE(tfs): These aren't actually set correctly at all. HTMLWidgets.widgets
//            does not give the actual instance we care about (with access to data)
var bubbleWidget = null;
var treeWidget   = null;

var BUBBLE_SELECTOR = "svg#bubbles-svg";
var TREE_SELECTOR   = "svg#tree-svg";

var selectors = {};

var selectedNodeID = -1;

var assignments = "";


// Add listeners once document is ready
$(document).ready(function() {
	// Leave a little buffer for max width
	$("#main-panel").css({ "max-width": ($(window).width() - (LEFT_BAR_WIDTH + 5)) + "px"});
	$("#document-details-content").css({ "max-width": ($(window).width() - (LEFT_BAR_WIDTH + 5)) + "px"});
	$(window).resize(function(event) {
		if (!exportMode) {
			$("#main-panel").css({ "max-width": ($(window).width() - (LEFT_BAR_WIDTH + 5)) + "px"});
			$("#document-details-content").css({ "max-width": ($(window).width() - (LEFT_BAR_WIDTH + 5)) + "px"});
			$("#doctab-document-container").css({ "height": ($(window).height() - $("#doctab-document-container").position().top) });
			$("#vocabtab-vocab-container").css({ "height": ($(window).height() - $("#vocabtab-vocab-container").position().top) });
		} else {
			if (flattenMode) {
				$("#main-panel").css({ "max-width": ($(window).width() - (RIGHT_BAR_WIDTH + 5)) + "px"});
				$("#document-details-content").css({ "max-width": ($(window).width() - (RIGHT_BAR_WIDTH + 5)) + "px"});
				$("#doctab-document-container").css({ "height": ($(window).height() - $("#doctab-document-container").position().top) });
				$("#vocabtab-vocab-container").css({ "height": ($(window).height() - $("#vocabtab-vocab-container").position().top) });
			}
		}
	});

	$("#help-button").click(function(event) {
		event.preventDefault();
		toggleHelpButton();
	});

	$("#help-box-background").click(function(event) {
		event.preventDefault();
		toggleHelpButton();
	});

	$("#bubbles-selector").click(function(event) {
		event.preventDefault();
		selectBubbles();
	});

	$("#right-bubbles-selector").click(function(event) {
		event.preventDefault();
		selectBubbles();
	});

	$("#tree-selector").click(function(event) {
		event.preventDefault();
		selectTree();
	});

	$("#right-tree-selector").click(function(event) {
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

	$("#left-bar-vocab-tab").click(function(event) {
		event.preventDefault();
		selectVocabTab();
	});

	$("#export-svg-button").click(function(event) {
		event.preventDefault();
		downloadActiveWidgetAsSVG();
	});

	$("#export-flattened-button").click(function(event) {
		event.preventDefault();
		enterFlattenMode();
	});

	$("#exit-flatten-button").click(function(event) {
		event.preventDefault();
		exitFlattenMode();
	});

	$("#updateTitle").click(function(event) {
		event.preventDefault();
	});

	$("#document-details-offset").click(hideDocumentDetails);
});


// Add Shiny listeners once Shiny is ready
$(document).on("shiny:sessioninitialized", function(event) {
	// Initialize some shiny inputs
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

	Shiny.addCustomMessageHandler("nodeDeletionComplete", handleNodeDeletion);

	Shiny.addCustomMessageHandler("clearFileInputs", clearFileInputs);

	Shiny.addCustomMessageHandler("clearSaveFile", clearSaveFile);

	Shiny.addCustomMessageHandler("clearFlatExportFile", clearFlatExportFile);

	Shiny.addCustomMessageHandler("cleanTitleInput", cleanTopicInputs);

	Shiny.addCustomMessageHandler("clusterNotification", clusterNotification);

	// Initialize which view is selected (starts on bubble widget)
	selectors[BUBBLE_LABEL] = BUBBLE_SELECTOR;
	selectors[TREE_LABEL] = TREE_SELECTOR;

	activeSelector = selectors[BUBBLE_LABEL];
	Shiny.onInputChange("selectedView", BUBBLE_LABEL);
});


// Once "Start" button is pressed, disable "Start" button and display processing message.
//     Then notify backend it can process input files
function processInputFile(msg) {
	$("#topic\\.start").attr("disabled", true);
	$("#init-message").removeClass("inplace-hidden-message");
	$("#init-message").trigger("shown");
	Shiny.onInputChange("start.processing", "");
}


// Switch to main view (from initial panel)
function initializeMainView(msg) {
	$("#doctab-document-container").css({ "height": ($(window).height() - $("#doctab-document-container").position().top) });
	$("#vocabtab-vocab-container").css({ "height": ($(window).height() - $("#vocabtab-vocab-container").position().top) });
};


function registerBubbleWidget(widget) {
	bubbleWidget = widget;
};


function registerTreeWidget(widget) {
	treeWidget = widget;
};


// Set shinyFiles input fields to null (for performance)
function clearFileInputs(msg) {
	Shiny.onInputChange("textlocation-modal", null);
	Shiny.onInputChange("textlocation", null);
	Shiny.onInputChange("modelfile-modal", null);
	Shiny.onInputChange("modelfile", null);
};


// Set shinyFiles save file field to null (for performance)
// Also handily makes repeated saves to the same file count as input changes (triggering save)
function clearSaveFile(msg) {
	Shiny.onInputChange("savedata-modal", null);
	Shiny.onInputChange("savedata", null);
};


// Set shinyFiles flat export field to null (for performance)
// Also handily makes repeated exports to the same file count as input changes (triggering save)
function clearFlatExportFile(msg) {
	Shiny.onInputChange("exportflat-modal", null);
	Shiny.onInputChange("exportflat", null);
}


// Handle clicking the bottom-right help button (toggling a popup help window)
function toggleHelpButton() {
	var helpboxcontainer = $("#help-box-background");
	var helpbox = $("#help-box");
	if (helpbox.hasClass("hidden-popup")) {
		helpboxcontainer.removeClass("hidden-popup");
		helpbox.removeClass("hidden-popup");
		showingHelp = true;
		helpbox.trigger("shown");
		helpboxcontainer.trigger("shown");
	} else {
		helpboxcontainer.addClass("hidden-popup");
		helpbox.addClass("hidden-popup");
		showingHelp = false;
		helpbox.trigger("hidden");
		helpboxcontainer.trigger("hidden");
	}
};


// NOTE(tfs): When hiding or showing an element that contains rendered Shiny output,
//            triggering jQuery "shown" and "hidden" events notifies Shiny to update/
//            render the content. Otherwise, the content is not updated while
//            "display: none;" is set. Alternately, set "suspendWhenHidden=FALSE"
//            using outputOptions on the R side.
//            Ref: https://groups.google.com/forum/#!topic/shiny-discuss/yxFuGgDOIuM
// Select the bubble widget/view
function selectBubbles() {
	if (selectedView === BUBBLE_LABEL) {
		return;
	}

	selectedView = BUBBLE_LABEL;
	
	$("#bubbles-selector").addClass("selected-view-button");
	$("#right-bubbles-selector").addClass("selected-view-button");
	$("#tree-selector").removeClass("selected-view-button");
	$("#right-tree-selector").removeClass("selected-view-button");
	
	$("#bubbles-view").trigger("show");
	$("#bubbles-view").removeClass("hidden-view");
	$("#bubbles-view").trigger("shown");

	$("#tree-view").trigger("hide");
	$("#tree-view").addClass("hidden-view");
	$("#tree-view").trigger("hidden");
	
	$("#bubbles-selector").attr("disabled", "disabled");
	$("#right-bubbles-selector").attr("disabled", "disabled");
	$("#tree-selector").removeAttr("disabled");
	$("#right-tree-selector").removeAttr("disabled");
	
	activeSelector = selectors[BUBBLE_LABEL];
	Shiny.onInputChange("selectedView", [BUBBLE_LABEL, Date.now()]);
};


// Select the tree widget/view
function selectTree() {
	if (selectedView === TREE_LABEL) {
		return;
	}

	selectedView = TREE_LABEL;
	
	$("#tree-selector").addClass("selected-view-button");
	$("#right-tree-selector").addClass("selected-view-button");
	$("#bubbles-selector").removeClass("selected-view-button");
	$("#right-bubbles-selector").removeClass("selected-view-button");
	
	$("#tree-view").trigger("show");
	$("#tree-view").removeClass("hidden-view");
	$("#tree-view").trigger("shown");
	
	$("#bubbles-view").trigger("hide");
	$("#bubbles-view").addClass("hidden-view");
	$("#bubbles-view").trigger("hidden");
	
	$("#tree-selector").attr("disabled", "disabled");
	$("#right-tree-selector").attr("disabled", "disabled");
	$("#bubbles-selector").removeAttr("disabled");
	$("#right-bubbles-selector").removeAttr("disabled");
	
	activeSelector = selectors[TREE_LABEL];
	Shiny.onInputChange("selectedView", [TREE_LABEL, Date.now()]);
};


// Select the topic tab on left panel
function selectTopicTab() {
	if (selectedLeftTab === TOPIC_LABEL) {
		return;
	}

	if (selectedLeftTab == DOCUMENT_LABEL) {
		$("#left-bar-document-content").trigger("hide");
		$("#left-bar-document-content").addClass("hidden-left-bar-content");
		$("#left-bar-document-content").trigger("hidden");

		$("#left-bar-document-tab").removeClass("active-left-bar-tab");
	} else if (selectedLeftTab == VOCAB_LABEL) {
		$("#left-bar-vocab-content").trigger("hide");
		$("#left-bar-vocab-content").addClass("hidden-left-bar-content");
		$("#left-bar-vocab-content").trigger("hidden");

		$("#left-bar-vocab-tab").removeClass("active-left-bar-tab");
	}

	$("#left-bar-topic-content").trigger("show");
	$("#left-bar-topic-content").removeClass("hidden-left-bar-content");
	$("#left-bar-topic-content").trigger("shown");

	$("#left-bar-topic-tab").addClass("active-left-bar-tab");

	selectedLeftTab = TOPIC_LABEL;
};


// Select the document tab on left panel
function selectDocumentTab() {
	if (selectedLeftTab === DOCUMENT_LABEL) {
		return;
	}

	if (selectedLeftTab == TOPIC_LABEL) {
		$("#left-bar-topic-content").trigger("hide");
		$("#left-bar-topic-content").addClass("hidden-left-bar-content");
		$("#left-bar-topic-content").trigger("hidden");

		$("#left-bar-topic-tab").removeClass("active-left-bar-tab");
	} else if (selectedLeftTab == VOCAB_LABEL) {
		$("#left-bar-vocab-content").trigger("hide");
		$("#left-bar-vocab-content").addClass("hidden-left-bar-content");
		$("#left-bar-vocab-content").trigger("hidden");

		$("#left-bar-vocab-tab").removeClass("active-left-bar-tab");
	}

	$("#left-bar-document-content").trigger("show");
	$("#left-bar-document-content").removeClass("hidden-left-bar-content");
	$("#left-bar-document-content").trigger("shown");

	$("#left-bar-document-tab").addClass("active-left-bar-tab");

	$("#doctab-document-container").css({ "height": ($(window).height() - $("#doctab-document-container").position().top) });

	selectedLeftTab = DOCUMENT_LABEL;
};


// Select the vocab tab on left panel
function selectVocabTab() {
	if (selectedLeftTab === VOCAB_LABEL) {
		return;
	}

	if (selectedLeftTab == TOPIC_LABEL) {
		$("#left-bar-topic-content").trigger("hide");
		$("#left-bar-topic-content").addClass("hidden-left-bar-content");
		$("#left-bar-topic-content").trigger("hidden");

		$("#left-bar-topic-tab").removeClass("active-left-bar-tab");
	} else if (selectedLeftTab == DOCUMENT_LABEL) {
		$("#left-bar-document-content").trigger("hide");
		$("#left-bar-document-content").addClass("hidden-left-bar-content");
		$("#left-bar-document-content").trigger("hidden");

		$("#left-bar-document-tab").removeClass("active-left-bar-tab");
	}

	$("#left-bar-vocab-content").trigger("show");
	$("#left-bar-vocab-content").removeClass("hidden-left-bar-content");
	$("#left-bar-vocab-content").trigger("shown");

	$("#left-bar-vocab-tab").addClass("active-left-bar-tab");

	$("#vocabtab-vocab-container").css({ "height": ($(window).height() - $("#vocabtab-vocab-container").position().top) });

	selectedLeftTab = VOCAB_LABEL;
};


// Display right panel (only if already in export mode)
function enterFlattenMode(msg) {
	if (!exportMode) { return; }
	if (flattenMode) { return; }

	$("#right-bar").addClass("right-content-flatten-mode");
	$(".export-mode-control").addClass("hidden");

	var newWidth = Math.min($(window).width() - (RIGHT_BAR_WIDTH + 5), 0.7 * $(window).width());
	flattenMode = true;
	Shiny.onInputChange("clear.flat.selection", Date.now());

	$("#main-panel").css({ "left": "0px" });
	$("#main-panel").css({ "right": "" });

	$("#main-panel").animate({ "width": newWidth }, 500, function() {
		$("#main-panel").css({ "max-width": ($(window).width() - (RIGHT_BAR_WIDTH + 5)) + "px" });
		$("#main-panel").css({ "width": "70vw" });
		$(window).trigger("resize");
	});
}


// Return to default export mode
function exitFlattenMode(msg) {
	if (!exportMode) { return; }
	if (!flattenMode) { return; }

	$("#right-bar").removeClass("right-content-flatten-mode");
	$(".export-mode-control").removeClass("hidden");

	flattenMode = false;
	Shiny.onInputChange("clear.flat.selection", Date.now());

	$("#main-panel").css({ "max-width": "unset" });
	$("#main-panel").animate({ "width": "100vw" }, 500, function() {
		$("#main-panel").css({ "right": "0px" });
		$("#main-panel").css({ "left": "" });
		$(window).trigger("resize"); // Not the cleanest solution, but seems to work
	});
}


// Hide left panel and adjust controls
function enterExportMode(msg) {
	if (exportMode) {
		return;
	} else {
		$("#left-bar").addClass("left-content-export-mode");
		$("#export-button-container").addClass("hidden");
		$(".export-mode-control").removeClass("hidden");
		exportMode = true;
		$("#main-panel").css({ "max-width": "unset" });
		$("#main-panel").animate({ "width": "100vw" }, 500, function() {
			$(window).trigger("resize"); // Not the cleanest solution, but seems to work
		});
	}
}


// Show left panel and adjust controls
function exitExportMode(msg) {
	if (exportMode) {
		$("#left-bar").removeClass("left-content-export-mode");
		$("#export-button-container").removeClass("hidden");
		$(".export-mode-control").addClass("hidden");
		exportMode = false;
		var newWidth = Math.min($(window).width() - (LEFT_BAR_WIDTH + 5), 0.7 * $(window).width());
		$("#main-panel").animate({ "width": newWidth }, 500, function() {
			$("#main-panel").css({ "max-width": ($(window).width() - (LEFT_BAR_WIDTH + 5)) + "px" });
			$("#main-panel").css({ "width": "70vw" });
			$(window).trigger("resize");
		});
	} else {
		return;
	}
}


var relevantStyles = [
	"display",
	"visibility",
	"background-color",
	"opacity",
	"stroke",
	"stroke-width",
	"fill",
	"font",
	"font-weight"
];


// Ref: https://stackoverflow.com/questions/15181452/how-to-save-export-inline-svg-styled-with-css-from-browser-to-image-file?utm_medium=organic&utm_source=google_rich_qa&utm_campaign=google_rich_qa
// Recursive function used to explicitly record style for SVG downloads
function setStyle(elem) {
	// console.log(window.getComputedStyle($(elem)[0]));
	var idstr = $(elem).attr("id");

	if (typeof idstr !== 'undefined') {
		$(elem).attr("id","clone-"+idstr);
		
		var compStyle = window.getComputedStyle(document.getElementById($(elem).attr("id").slice(6)));

		var styleString = "";

		for (var idx = 0; idx < relevantStyles.length; idx++) {
			var styleKind = relevantStyles[idx];
			styleString += styleKind + ":" + compStyle.getPropertyValue(styleKind) + "; ";
		}

		$(elem).attr("style", styleString);
	}

	$(elem).children().each(function(i) { setStyle($(this)) });
}


// Ref: https://stackoverflow.com/questions/15181452/how-to-save-export-inline-svg-styled-with-css-from-browser-to-image-file
// Create an svg string for download.
function downloadActiveWidgetAsSVG() {
	// NOTE(tfs): Should probably be using 'let', but I don't think it's been fully adopted yet
	var serializer = new XMLSerializer();
	// var sourceString = serializer.serializeToString($(activeSelector)[0]);

	var clone = $(activeSelector).clone(true, true, true);
	setStyle(clone);

	var sourceString = serializer.serializeToString($(clone)[0]);

	// Ref: https://stackoverflow.com/questions/2483919/how-to-save-svg-canvas-to-local-filesystem
	$("body").append("<a id=\"tmp-download-link\" class=\"hidden\"></a>");
	$("#tmp-download-link").attr("href", "data:image/svg+xml;utf8," + sourceString)
			.attr("download", selectedView + ".svg")
			.attr("target", "_blank");
	$("#tmp-download-link")[0].click();
	$("a#tmp-download-link").remove();

	// NOTE(tfs): Not 100% sure this adequately cleans up. If downloading ends up causing
	//            performance issues, check here first.
	$(clone).remove();
}


// Select topic tab on left panel
function handleTopicSelection(selectedID) {
	var needsCleaning = (selectedID !== selectedNodeID);

	selectedNodeID = selectedID;

	if (selectedID !== "") {
		activateTopicTabInputs(needsCleaning);
	} else {
		deactivateTopicTabInputs();
	}
}


// If needed, clean and show left panel topic tab controls
function activateTopicTabInputs(needsCleaning) {
	if (needsCleaning) {
		cleanTopicInputs();
	}

	$("#topic-controls-inputs-container").trigger("show");
	$("#topic-controls-inputs-container").removeClass("hidden");
	$("#topic-controls-inputs-container").trigger("shown");
}


// If needed, clean and hide left panel topic tab controls
function deactivateTopicTabInputs() {
	cleanTopicInputs();

	$("#topic-controls-inputs-container").trigger("hide");
	$("#topic-controls-inputs-container").addClass("hidden");
	$("#topic-controls-inputs-container").trigger("hidden");
}


// Notify backend of document click, then display the contents of the document (provided by backend)
function clickDocumentSummary(docID) {
	Shiny.onInputChange("document.details.docid", docID);
	displayDocumentDetails();
}


// Remove past html content for document details
function cleanDocumentDetails() {
	$("#document-details-content").html("");
}


// Show the div containing document details (title and content)
function displayDocumentDetails() {
	$("#document-details-container").trigger("show");
	$("#document-details-container").removeClass("hidden");
	$("#document-details-container").trigger("shown");
}


// Hide div containing document details (title and content)
function hideDocumentDetails() {
	$("#document-details-container").trigger("hide");
	$("#document-details-container").addClass("hidden");
	$("#document-details-container").trigger("hidden");
}


// Remove values from left panel topic tab controls
function cleanTopicInputs(msg) {
	// NOTE(tfs): Apparently using jquery to set val()
	//            doesn't trigger an update to the input field for Shiny

	$("#topic\\.customTitle").val("");
	Shiny.onInputChange("topic.customTitle", "")

	var defNumClusters = parseInt($("#runtime\\.numClusters").attr("data-shinyjs-resettable-value"))
	$("#runtime\\.numClusters").val(defNumClusters);
	Shiny.onInputChange("runtime.numClusters", defNumClusters)
}


// Notify user that clustering is occuring
function clusterNotification(msg) {
	console.log("Clustering has begun, better notifications to be implemented");
}


// Upon runtime clustering, clear selected topic field
function handleRuntimeCluster(msg) {
	Shiny.onInputChange("topic.selected", "");
	cleanTopicInputs();
}


// Log error during runtime clustering
function handleRuntimeClusterError(err) {
	console.log(err);
}


// Upon node deletion, clear selected topic field
function handleNodeDeletion(msg) {
	Shiny.onInputChange("topic.active", "");
	Shiny.onInputChange("topic.selected", "");
	cleanTopicInputs();
}

