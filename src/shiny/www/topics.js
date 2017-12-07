var showingHelp = false; // This is probably just terrible AND not needed
var selectedView = "Bubbles";
var selectedLeftTab = "Document";
var data = null;


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
