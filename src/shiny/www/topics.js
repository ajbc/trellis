var showingHelp = false; // This is probably just terrible AND not needed
var selectedView = "Bubbles";



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


function toggleHelpButton() {
	var helpbox = $("#help-box");
	if (helpbox.hasClass("hidden-popup")) {
		helpbox.removeClass("hidden-popup");
		showingHelp = false;
	} else {
		helpbox.addClass("hidden-popup");
		showingHelp = true;
	}
}


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
}


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
