var showingHelp = false; // This is probably just terrible AND not needed
var selectedView = "Bubbles";
var selectedViewTab
var selectedLeftTab = "Document";
var data = null;
var exportMode = false;
var LEFT_BAR_WIDTH = 300;
var activeWidget;

var bubbleWidget;
var treeWidget;
var widgets = {};

$(document).ready(function() {
	// Leave a little buffer for max width
	$("#main-panel").css({ "max-width": ($(window).width() - (LEFT_BAR_WIDTH + 5)) + "px"});
	$(window).resize(function(event) {
		if (!exportMode) {
			$("#main-panel").css({ "max-width": ($(window).width() - (LEFT_BAR_WIDTH + 5)) + "px"});
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

	$("#export-cancel-button").click(function(event) {
		event.preventDefault();
		Shiny.onInputChange("toggleExportMode")
	});
});


$(document).on("shiny:sessioninitialized", function(event) {
	Shiny.onInputChange("topics", "");
	Shiny.onInputChange("topic.selected", "");

	Shiny.addCustomMessageHandler("initData", function(msg) {
		alert("Please");
		initializeData(msg);
	});

	Shiny.addCustomMessageHandler("startInit", function(msg) {
		alert(msg);
	});

	Shiny.addCustomMessageHandler("parsed", function(msg) {
		alert(msg);
	});

	Shiny.addCustomMessageHandler("processingFile", function(msg) {
		$("#topic\\.start").attr("disabled", true);
		$("#init-message").removeClass("inplace-hidden-message");
	});

	Shiny.addCustomMessageHandler("enterExportMode", enterExportMode);
	Shiny.addCustomMessageHandler("exitExportMode", exitExportMode);

	for (var i = 0; i < HTMLWidgets.widgets.length; i++) {
		switch (HTMLWidgets.widgets[i].name) {
			case "topicBubbles":
				bubbleWidget = HTMLWidgets.widgets[i];
				break;
		}
	}

	treeWidget = { resize: function (el, w, h) { console.log(el, w, h); } };

	widgets["Bubbles"] = bubbleWidget;
	widgets["Tree"] = treeWidget;
});


function updateData(dataObject) {
	data = dataObject;
};


function toggleHelpButton() {
	var helpbox = $("#help-box");
	if (helpbox.hasClass("hidden-popup")) {
		helpbox.removeClass("hidden-popup");
		showingHelp = false;
	} else {
		helpbox.addClass("hidden-popup");
		showingHelp = true;
	}
};


function selectBubbles() {
	if (selectedView == "Bubbles") {
		return;
	}

	selectedView = "Bubbles";
	$("#bubbles-selector").addClass("selected-view-button");
	$("#tree-selector").removeClass("selected-view-button");
	$("#bubbles-view").removeClass("hidden-view");
	$("#tree-view").addClass("hidden-view");
	$("#bubbles-selector").attr("disabled", "disabled");
	$("#tree-selector").removeAttr("disabled");
};


function selectTree() {
	if (selectedView == "Tree") {
		return;
	}

	selectedView = "Tree";
	$("#tree-selector").addClass("selected-view-button");
	$("#bubbles-selector").removeClass("selected-view-button");
	$("#tree-view").removeClass("hidden-view");
	$("#bubbles-view").addClass("hidden-view");
	$("#tree-selector").attr("disabled", "disabled");
	$("#bubbles-selector").removeAttr("disabled");
};


function selectTopicTab() {
	if (selectedLeftTab == "Topic") {
		return;
	}

	selectedLeftTab = "Topic";
	$("#left-bar-topic-tab").addClass("active-left-bar-tab");
	$("#left-bar-document-tab").removeClass("active-left-bar-tab");
	$("#left-bar-topic-content").removeClass("hidden-left-bar-content");
	$("#left-bar-document-content").addClass("hidden-left-bar-content");
};


function selectDocumentTab() {
	if (selectedLeftTab == "Document") {
		return;
	}

	selectedLeftTab = "Document";
	$("#left-bar-document-tab").addClass("active-left-bar-tab");
	$("#left-bar-topic-tab").removeClass("active-left-bar-tab");
	$("#left-bar-document-content").removeClass("hidden-left-bar-content");
	$("#left-bar-topic-content").addClass("hidden-left-bar-content");
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
